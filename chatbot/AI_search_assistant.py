###################################################
# Date: 
# Start from 2025/8/19
# Last update 2026/3/2
# Author: Gem
# Description: AI search + chatbot
###################################################

from flask import Flask, request, jsonify, render_template,Response


from datetime import datetime
import os
from dotenv import load_dotenv
import logging
import re
import requests  
from uuid_extensions import uuid7
from transformers import AutoTokenizer
from sentence_transformers import SentenceTransformer
import pytz
import json
from opensearchpy import OpenSearch,NotFoundError
###################################################################
# Load environment variables
load_dotenv()

tz = pytz.timezone('Asia/Hong_kong')


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


app.config["MAIL_USERNAME"] = os.getenv("MAIL_USERNAME")
app.config["MAIL_PASSWORD"] = os.getenv("MAIL_PASSWORD")
app.config['CA_CERTS'] = os.getenv("CA_CERTS")

host = [
    {'host':'localhost','port':9200}
]

auth = ('admin','ASLgemini916')

client = OpenSearch(
                hosts=host,
                http_compress = True,
                http_auth=auth,
                use_ssl=True,
                verify_certs=False,
                ssl_assert_hostname = False,
                ssl_show_warn=False
            )
es = client
chat_tokenizer_dir = "./"
# Initialize tokenizer (for chat model tokens count)
try:
    tokenizer = AutoTokenizer.from_pretrained( 
        chat_tokenizer_dir, 
        trust_remote_code=True
        )
except:
    # Fallback to approximate counting if tokenizer not available
    tokenizer = None

# NLP model
model = SentenceTransformer('./local_models/multilingual-e5-small',device='cuda')

# Configuration
MAX_CONTEXT_LENGTH = 5000
WARNING_THRESHOLD = 4000
INDEX_NAME = os.getenv("SEARCH_INDEX_NAME")
CHAT_LOG_INDEX = "chat_logs_isd"

LLM_API = "http://localhost:11434/api/chat"
LLM_MODEL = os.getenv("LLM_MODEL")

###################################################################

def validate_date_format(date_str):
    """Validate the custom date format YYYYMM/DD"""
    return bool(re.match(r'^\d{4}\d{2}/\d{2}$', date_str))

def convert_to_es_date(date_str):
    """Convert from YYYY-MM-DD to YYYYMM/DD format"""
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        return date_obj.strftime('%Y%m/%d')
    except ValueError:
        return None

@app.route('/')
def home():
    return render_template('isd_search_withLLM_test.html')


@app.route('/search', methods=['GET'])
def search():
    try:
        # Validate parameters
        query = request.args.get('q', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        
        # Get pagination parameters with defaults
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        
        # Calculate from/size for Elasticsearch
        if page < 1:
            page = 1
        if per_page not in [10, 20, 50]:
            per_page = 20
        
        from_idx = (page - 1) * per_page
        size = per_page * 3  # 获取更多结果，用于应用层过滤
        
        # 构建日期过滤条件
        date_filter = {}
        if start_date:
            es_start_date = convert_to_es_date(start_date)
            if es_start_date:
                date_filter["gte"] = es_start_date
        
        if end_date:
            es_end_date = convert_to_es_date(end_date)
            if es_end_date:
                date_filter["lte"] = es_end_date
        
        # 构建查询
        body = {
            "from": from_idx,
            "size": size,
            "search_pipeline": "rrf-pipeline",
            "highlight": {
                "fields": {
                    "press_release": {},
                    "title": {}
                }
            }
            
        }

        # 处理查询条件
        if query:
            # Check if query is a potential date (8 digits)
            if query.isdigit() and len(query) == 8:
                # Convert to YYYYMM/DD format
                date_query = f"{query[:4]}{query[4:6]}/{query[6:]}"
                if validate_date_format(date_query):
                    body["query"] = {
                        "term": {
                            "release_date": date_query
                        }
                    }
            else:
                # 生成查询的向量嵌入
                query_embedding = model.encode(query).tolist()
                
                # 构建 hybrid 查询 - 每个子查询都有自己的 filter
                hybrid_queries = []
                
                # 1. 文本搜索
                text_query = {
                    "multi_match": {
                        "query": query,
                        "fields": ["press_release", "title"]
                    }
                }
                
                # 如果日期过滤存在，将文本查询包装在 bool 中
                if date_filter:
                    text_query = {
                        "bool": {
                            "must": [
                                {"multi_match": {
                                    "query": query,
                                    "fields": ["press_release", "title"]
                                }}
                            ],
                            "filter": [
                                {"range": {"release_date": date_filter}}
                            ]
                        }
                    }
                
                hybrid_queries.append(text_query)
                
                # 2. 标题向量搜索
                title_knn_query = {
                    "knn": {
                        "title_embedding": {
                            "vector": query_embedding,
                            "k": 50  # 获取更多KNN结果
                        }
                    }
                }
                
                # 添加日期过滤到 KNN 查询
                if date_filter:
                    title_knn_query["knn"]["title_embedding"]["filter"] = {
                        "range": {"release_date": date_filter}
                    }
                
                hybrid_queries.append(title_knn_query)
                
                # 3. 内容分块向量搜索
                nested_knn_query = {
                    "nested": {
                        "path": "press_release_chunks",
                        "query": {
                            "knn": {
                                "press_release_chunks.embedding": {
                                    "vector": query_embedding,
                                    "k": 50  # 获取更多KNN结果
                                }
                            }
                        }
                    }
                }
                
                # 添加日期过滤到嵌套 KNN 查询
                if date_filter:
                    nested_knn_query["nested"]["query"]["knn"]["press_release_chunks.embedding"]["filter"] = {
                        "range": {"release_date": date_filter}
                    }
                
                hybrid_queries.append(nested_knn_query)
                
                # 设置 hybrid 查询
                # body["search_pipeline"] = "rrf-pipeline"
                body["query"] = {
                    "hybrid": {
                        "queries": hybrid_queries
                    }
                }
        
        # 如果没有查询条件，但有日期过滤
        elif not query and date_filter:
            body["query"] = {
                "range": {
                    "release_date": date_filter
                }
            }
        # 既没有查询也没有日期过滤
        elif not query:
            body["query"] = {"match_all": {}}
        
        # # 打印查询以便调试
        # print("=== Hybrid Search Query with Filters ===")
        # print(json.dumps(body, indent=2, ensure_ascii=False)[:2000])
        # print("====================")
        
        # Execute search
        res = es.search(index=INDEX_NAME, body=body)
        
        # 在应用层面进行二次日期过滤
        hits = res['hits']['hits']
        filtered_hits = []
        
        for hit in hits:
            source = hit['_source']
            release_date = source.get('release_date', '')
            
            # 检查日期是否符合条件
            date_passed = True
            
            if date_filter:
                if "gte" in date_filter and release_date < date_filter["gte"]:
                    date_passed = False
                if "lte" in date_filter and release_date > date_filter["lte"]:
                    date_passed = False
            
            if date_passed:
                filtered_hits.append(hit)
        
        # 应用层分页处理
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paged_hits = filtered_hits[start_idx:end_idx]
        
        # Process results
        results = []
        for hit in paged_hits:
            source = hit['_source']
            result = {
                'id': hit['_id'],
                'score': hit['_score'],
                'source': source,
                'highlight': hit.get('highlight', {})
            }
            
            # Format dates for display
            if 'release_date' in source:
                result['source']['formatted_date'] = format_for_display(source['release_date'])
            if 'crawl_date' in source:
                result['source']['formatted_crawl_date'] = format_for_display(source['crawl_date'])
            
            results.append(result)
        
        # 计算真实的分页信息（基于过滤后的结果）
        total_filtered_results = len(filtered_hits)
        total_pages = (total_filtered_results + per_page - 1) // per_page if total_filtered_results > 0 else 1
        
        # 调试信息
        print(f"原始结果数: {len(hits)}")
        print(f"应用层过滤后结果数: {total_filtered_results}")
        print(f"日期过滤条件: {date_filter}")
        
        return jsonify({
            'total': total_filtered_results,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
            'results': results,
            'debug': {
                'original_hits': len(hits),
                'filtered_hits': total_filtered_results,
                'date_filter_applied': bool(date_filter)
            }
        })
        
    except NotFoundError:
        logger.error("Index not found", exc_info=True)
        return jsonify({'error': 'Index not found'}), 404
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


def format_for_display(date_str):
    """Convert from YYYYMM/DD to Month Day, Year format"""
    try:
        # Handle both release_date (YYYYMM/DD) and crawl_date (regular date) formats
        if '/' in date_str and len(date_str) == 8:  # YYYYMM/DD format
            date_obj = datetime.strptime(date_str, '%Y%m/%d')
        else:  # Assume standard ISO format
            date_obj = datetime.fromisoformat(date_str)
        return date_obj.strftime('%B %d, %Y')
    except (ValueError, TypeError):
        return date_str



def remove_deepthink(response_content):
    """
    Removes the <think>...</think> part from the response content.
    
    Args:
        response_content (str or dict): The response content containing the <think> part.
                                       Can be a string or a dictionary with a 'message' key.
    
    Returns:
        str or dict: The cleaned content without the <think> part.
    """
    if isinstance(response_content, dict):
        if 'message' in response_content and 'content' in response_content['message']:
            content = response_content['message']['content']
            cleaned_content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
            response_content['message']['content'] = cleaned_content.strip()
        return response_content
    elif isinstance(response_content, str):
        return re.sub(r'<think>.*?</think>', '', response_content, flags=re.DOTALL).strip()
    else:
        return response_content

############################################
#tokens count
def count_tokens(messages: list) -> int:
    """Count tokens accurately if tokenizer exists, otherwise estimate"""
    if tokenizer:
        result = sum(len(tokenizer.encode(msg["content"])) for msg in messages)
        print(f"======tokenizer=====tokens count: {result}")
        return result
    # Fallback estimation (1 token ≈ 4 characters)
    result = sum(len(msg["content"]) // 4 for msg in messages)
    print(f"======tokens count: {result}")
    return result


def get_chatlog_results(index: str, chat_id: str) -> list[dict]:
    """Fetch all messages from a chat log by chat_id"""
    try:
        # Search for documents with this chat_id
        response = es.get(
            index=index,
            id=chat_id,
            
        )
         
            # Return messages from the document
        return response['_source']['payload']['messages']
        
    
    except NotFoundError:
        return []  # Chat ID doesn't exist
    

def log_chat_interaction(chat_id,payload,assistant_response):
    """Log chat interaction to Elasticsearch"""
    
    chat_data = {
    "chat_id": chat_id,
    "timestamp": datetime.now(tz).isoformat(),
    "payload": {
        "model": payload["model"],
        "messages": payload["messages"],
        "parameters": {
            "temperature": payload["parameters"]["temperature"],
            "max_tokens": payload["parameters"]["max_tokens"],
            "top_p": payload["parameters"]["top_p"]
            # "top_k": payload["parameters"]["top_k"]
            # "frequency_penalty": payload["frequency_penalty"]
        }
    },
    "response": assistant_response
    }

    try:
        es.index(index=CHAT_LOG_INDEX, id=chat_id,body=chat_data)
    except Exception as e:
        print(f"Failed to log chat interaction: {e}")



def create_log_index_if_not_exists():
    """Create the chat logs index if it doesn't exist"""
    if not es.indices.exists(index=CHAT_LOG_INDEX):
        es.indices.create(
            index=CHAT_LOG_INDEX,
            body={
                "mappings": {
                    "properties": {
                        "chat_id": {"type": "keyword"},
                        "timestamp": {"type": "date"},
                        "payload": {
                            "type": "object",
                            "properties": {
                                "model": {"type": "keyword"},
                                "messages": {"type": "nested"},
                                "parameters": {
                                    "type": "object",
                                    "properties": {
                                        "temperature": {"type": "float"},
                                        "max_tokens": {"type": "integer"},
                                        "top_p": {"type": "float"},
                                        "top_k": {"type": "integer"},
                                        "frequency_penalty": {"type": "float"}
                                    }
                                }
                            }
                        },
                        "response": {"type": "text"}
                    }
                }
            }
        )

################################################################################
def generate_completion(chatlog_index, chat_id, user_prompt, stream=False):
    messages = []

    if chat_id:
        messages = get_chatlog_results(index=chatlog_index, chat_id=chat_id)
    else:
        print("------chat id not exist-------")
        chat_id = str(uuid7())

    print('------chat id:-------')
    print(chat_id)

    messages.append({"role": "user", "content": user_prompt})

    # Check token limits
    total_tokens = count_tokens(messages=messages)
    if total_tokens > MAX_CONTEXT_LENGTH:
        print("Token limit exceeded")

        if stream:
            def error_generator():
                error_obj = {
                    "exceed_tokens": "context_length_exceeded",
                    "message": "Please refresh the page to start a new session (context too long)",
                    "max_tokens": MAX_CONTEXT_LENGTH,
                    "current_tokens": total_tokens,
                    "complete": True
                }
                yield f"data: {json.dumps(error_obj)}\n\n"
            return Response(error_generator(), mimetype='text/event-stream')
        else:
            return {
                "exceed_tokens": "context_length_exceeded",
                "message": "Please refresh the page to start a new session (context too long)",
                "max_tokens": MAX_CONTEXT_LENGTH,
                "current_tokens": total_tokens
            }
    
    elif total_tokens > WARNING_THRESHOLD:
        print(f"Warning: Chat {chat_id} approaching token limit ({total_tokens}/{MAX_CONTEXT_LENGTH})")

    url = LLM_API
    payload = {
        "model": LLM_MODEL,
        "stream": stream,  # Use the stream parameter
        "think": False,
        "parameters": {
            "temperature": 0.2,
            "top_p": 0.7,
            "max_tokens": 10000
        },
        "messages": messages
    }
    
    print("=======payload:")
    print(payload)

    headers = {"Content-Type": "application/json"}

    if stream:
        # Return a generator function for streaming
        def generate():
            try:
                assistant_response = ""
                
                # Make streaming request
                response = requests.post(
                    url, 
                    json=payload, 
                    headers=headers, 
                    stream=True,
                    timeout=60
                )
                
                if response.status_code != 200:
                    error_obj = {
                        "error": f"LLM API error: {response.status_code}",
                        "complete": True
                    }
                    yield f"data: {json.dumps(error_obj)}\n\n"
                    return
                
                # Stream the response
                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode('utf-8')
                        try:
                            data = json.loads(decoded_line)
                            if 'message' in data and 'content' in data['message']:
                                chunk = data['message']['content']
                                assistant_response += chunk
                                # Send chunk to client
                                chunk_obj = {
                                    "chunk": chunk,
                                    "chat_id": chat_id,
                                    "complete": False
                                }
                                yield f"data: {json.dumps(chunk_obj)}\n\n"
                        except json.JSONDecodeError:
                            continue
                
                # After streaming completes
                # Remove deepthink tags from the full response
                cleaned_response = remove_deepthink(assistant_response)
                
                # Log the conversation
                payload['messages'].append({'role': "assistant", "content": cleaned_response})
                log_chat_interaction(
                    chat_id=chat_id, 
                    payload=payload, 
                    assistant_response=cleaned_response
                )
                
                # Update chat log in Elasticsearch
                es.update(
                    index=CHAT_LOG_INDEX,
                    id=chat_id,
                    body={
                        "doc": {
                            "messages": payload['messages']
                        }
                    },
                    refresh=True
                )
                
                # Send completion signal
                complete_obj = {
                    "complete": True,
                    "chat_id": chat_id,
                    "assistant_response": cleaned_response
                }
                yield f"data: {json.dumps(complete_obj)}\n\n"
                
            except Exception as e:
                error_obj = {
                    "error": str(e),
                    "complete": True
                }
                yield f"data: {json.dumps(error_obj)}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
    
    else:
        # Non-streaming mode (original logic)
        full_response = requests.post(url, json=payload, headers=headers)
        result = full_response.json()
        print('========full response:')
        print(result)

        if full_response.status_code == 200:
            assistant_response = result['message']['content']
            cleaned_response = remove_deepthink(assistant_response)
            payload['messages'].append({'role': "assistant", "content": cleaned_response})
           
            # Prepare chat log document
            log_chat_interaction(
                chat_id=chat_id, 
                payload=payload, 
                assistant_response=cleaned_response
            )
            
            es.update(
                index=CHAT_LOG_INDEX,
                id=chat_id,
                body={
                    "doc": {
                        "messages": payload['messages']
                    }
                },
                refresh=True
            )
        
            return {
                'full_response': full_response,
                'chat_id': chat_id
            }
        else:
            return {"choices": [{"message": {"content": "An error occurred while generating the response."}}]}


@app.route('/summarize-multiple', methods=['POST'])
def summarize_multiple():
    try:
        data = request.get_json()
        chat_id = data.get("chat_id")
        press_releases = data.get('press_releases', [])
        stream = True  # Add stream parameter

        if not press_releases or len(press_releases) > 3:
            return jsonify({'error': 'Please select 1-3 press releases'}), 400
        
        # Combine selected press releases
        combined_text = "\n\n---\n\n".join([
            f"Title: {pr['title']}\nDate: {pr['date']}\nContent: {pr['content']}"
            for pr in press_releases
        ])
        
        user_prompt = f"您是香港政府新闻稿的助手。请按照新闻稿内容回答问题。请列出新闻稿标题，比较并总结这 {len(press_releases)} 篇新闻稿，突出主要的相同点和不同点：\n\n{combined_text}"
        
        # Call LLM API with streaming option
        if stream:
            return generate_completion(
                chatlog_index=CHAT_LOG_INDEX,
                chat_id=chat_id,
                user_prompt=user_prompt,
                stream=True
            )
        else:
            llm_response = generate_completion(
                chatlog_index=CHAT_LOG_INDEX,
                chat_id=chat_id,
                user_prompt=user_prompt,
                stream=False
            )
            
            if llm_response.get("exceed_tokens") == "context_length_exceeded":
                return jsonify(llm_response), 400

            response = llm_response['full_response'].json()
            response_content = remove_deepthink(response['message']['content'])
            response['message']['content'] = response_content
            
            print('=========remove deepthink _ response:')
            print(response)
            
            summary = response['message']['content']
            print(f"summary : {summary}")
            return jsonify({
                'chat_id': llm_response['chat_id'],
                'summary': summary
            })
        
    except Exception as e:
        logger.error(f"Summarization error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Summarization failed'}), 500


###########################################################################
@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        chat_id = data.get("chat_id")
        press_releases = data.get('press_releases', [])
        question = data.get('question', '')
        stream = True  # Add stream parameter

        # Combine selected press releases
        combined_text = "\n\n---\n\n".join([
            f"Title: {pr['title']}\nDate: {pr['date']}\nContent: {pr['content']}"
            for pr in press_releases
        ])

        if press_releases:
            if len(press_releases) > 3:
                return jsonify({'error': 'Please select 1-3 press releases'}), 400
            else:
                user_prompt = f"你是一位贴心的助手，解答关于这篇新闻稿的所有疑问。问题：{question}\n以下是新闻稿内容：\n\n{combined_text}"
        
        if chat_id and not press_releases:
            user_prompt = f"你是一位贴心的助手，请根据上下文内容回答。不要回答与上下文主题不想关的问题，使用问题的语言进行回答。以下是我的问题：{question}"
                    
        if not question:
            return jsonify({'error': 'Missing question'}), 400
        
        # Call LLM API with streaming option
        if stream:
            return generate_completion(
                chatlog_index=CHAT_LOG_INDEX,
                chat_id=chat_id,
                user_prompt=user_prompt,
                stream=True
            )
        else:
            llm_response = generate_completion(
                chatlog_index=CHAT_LOG_INDEX,
                chat_id=chat_id,
                user_prompt=user_prompt,
                stream=False
            )
            
            if llm_response.get("exceed_tokens") == "context_length_exceeded":
                return jsonify(llm_response), 400

            response = llm_response['full_response'].json()
            response_content = remove_deepthink(response['message']['content'])
            response['message']['content'] = response_content
            
            print('=========remove deepthink _ response:')
            print(response)

            answer = response['message']['content']
            print(f"chat answer: {answer}")
            return jsonify({
                'chat_id': llm_response['chat_id'],
                'answer': answer
            })
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Chat failed'}), 500



if __name__ == '__main__':
    create_log_index_if_not_exists()
    app.run(host='0.0.0.0', port=int(os.getenv('FLASK_PORT', 5000)))
    