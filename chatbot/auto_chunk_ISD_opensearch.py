import pandas as pd
from elasticsearch import Elasticsearch
import re
import nltk
from langdetect import detect, LangDetectException
from pysbd import Segmenter
import hanzidentifier
from sentence_transformers import SentenceTransformer

from opensearchpy import OpenSearch  
import time
import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()
# Initialize segmenters
nltk.download('punkt')
seg_en = Segmenter(language="en", clean=False)
seg_zh = Segmenter(language="zh", clean=False)

# Initialize Elasticsearch client
'''
es = Elasticsearch(
    hosts='https://localhost:9200',
    basic_auth=('elastic', '123456'),
    verify_certs=True,
    ca_certs= "elk_901/certs/ca/ca.crt",
    request_timeout=30,
    retry_on_timeout=True
)
'''
host = [
    {'host':'localhost','port':9200}
]

auth = ('admin','ASLgemini916')

es = OpenSearch(
                hosts=host,
                http_compress = True,
                http_auth=auth,
                use_ssl=True,
                verify_certs=False,
                ssl_assert_hostname = False,
                ssl_show_warn=False
            )

# Configuration
#CSV_PATH = "search-wsd_w_en_all.csv"


SOURCE_INDEX_NAME = os.getenv("SOURCE_INDEX_NAME")
INDEX_NAME = os.getenv("CHUNK_INDEX_NAME")
EMBEDDING_MODEL_ID = ".multilingual-e5-small-elasticsearch"
MAX_CHUNK_SIZE = 250
SCROLL_SIZE = 100  #  this for batch processing
SCROLL_TIMEOUT = "5m"  #  this for scroll timeout
LOCAL_EMBEDDING_MODEL = SentenceTransformer('./local_models/multilingual-e5-small')

# Fields to generate embeddings for
EMBEDDING_FIELDS = ['press_release','title']

# Delete existing index if it exists
if es.indices.exists(index=INDEX_NAME):
    es.indices.delete(index=INDEX_NAME)

# Create index with correct mapping
index_mapping = {
    "settings": {
        "index": {
            "knn": True
        }
    },
    "mappings": {
        "properties": {
            # "all_release_title": {"type": "keyword"},
            "press_release": {"type": "text"},
            "press_release_chunks": {
                "type": "nested",
                "properties": {
                    "text": {"type": "text"},
                    "embedding": {
                        "type": "knn_vector",
                        "dimension": 384,
                        "method": {
                            "name":"hnsw",
                            "space_type":"cosinesimil",
                            "engine":"faiss"
                        }
                    }
                }
            },
            "links": {"type": "text"},
            "crawl_date": {"type": "date", "format": "iso8601"},
            "release_date": {"type": "date", "format": "yyyyMM/dd"},
            "title": {"type": "text"},
            "title_embedding": {
                "type": "knn_vector",
                "dimension": 384,
                "method": {
                    "name":"hnsw",
                    "space_type":"cosinesimil",
                    "engine":"faiss"
                    }
            },
            "url": {"type": "keyword"},
            "depth":{"type":"short"}


        }
    }
}



def clean_text(text):
    """Clean text before processing"""
    if pd.isna(text) or not isinstance(text, str):
        return ""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def is_chinese_char(char):
    """Check if a character is a Chinese character"""
    return '\u4e00' <= char <= '\u9fff' or char in {'，', '。', '！', '？', '；', '：', '、'}

def detect_primary_language(text, sample_size=100):
    """Detect the primary language of text with fallback to character analysis"""
    text = clean_text(text)
    if not text:
        return 'en'  # default to English if empty
    
    sample = text[:sample_size]
    
    try:
        is_chinese = hanzidentifier.has_chinese(sample)
        
        if is_chinese:
            return 'zh'
        return 'en'
    except Exception:
        pass
    
    chinese_count = sum(1 for c in sample if is_chinese_char(c))
    return 'zh' if chinese_count > len(sample) / 2 else 'en'

def segment_text(text, language):
    """Segment text into sentences based on language"""
    text = clean_text(text)
    if not text:
        return []
    
    if language == 'zh':
        sentences = seg_zh.segment(text)
    else:
        sentences = seg_en.segment(text)
    
    return [s.strip() for s in sentences if s.strip()]

def calculate_chunk_size(text, language):
    """Calculate chunk size considering both Chinese and English"""
    text = clean_text(text)
    if not text:
        return 0
    
    if language == 'zh':
        return len(text)
    else:
        return len(text.split())

def chunk_text(text):
    """Intelligently chunk text with one sentence overlap between chunks"""
    text = clean_text(text)
    if not text:
        return []
    
    paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    chunks = []
    #print("-------paragraghs: ")
    #print(paragraphs)
    
    for para in paragraphs:
        lang = detect_primary_language(para)
        sentences = segment_text(para, lang)

        #print("-------sentences: ")
        #print(sentences)
        
        if not sentences:
            continue
            
        if len(sentences) == 1:
            chunks.append(sentences[0])
            continue
            
        start_idx = 0
        current_length = 0
        current_chunk = []
        
        for i, sentence in enumerate(sentences):
            #print(f"sentence {i}: \n {sentence}")
            sent_lang = detect_primary_language(sentence)
            sent_length = calculate_chunk_size(sentence, sent_lang)
            #print(sent_lang)
            #print(sent_length)
            
            current_chunk.append(sentence)
            current_length += sent_length
            
            if current_length >= MAX_CHUNK_SIZE or i == len(sentences) - 1:
                chunks.append(" ".join(current_chunk))
                
                if i < len(sentences) - 1:
                    current_chunk = [sentence]
                    current_length = sent_length
                else:
                    current_chunk = []
                    current_length = 0
            elif i == len(sentences) - 1 and current_chunk:
                chunks.append(" ".join(current_chunk))
                
    
    return chunks

def generate_embeddings(texts):
    """Generate embeddings using local model"""
    if not texts:
        return []
    
    texts = [t for t in texts if clean_text(t)]
    if not texts:
        return []
    
    try:
        # Add prefix as required by E5 models
        prefixed_texts = [f"passage: {text}" for text in texts]
        embeddings = LOCAL_EMBEDDING_MODEL.encode(prefixed_texts, normalize_embeddings=True)
        return embeddings.tolist()
    except Exception as e:
        print(f"Error generating embeddings: {str(e)}")
        return []



def clean_field_value(value):
    """Clean field values before indexing"""
    if pd.isna(value):
        return None
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, list):
        return [clean_field_value(v) for v in value]
    return value

###################################################################
'''
def process_csv():
    """Main processing function"""
    df = pd.read_csv(CSV_PATH)
    
    for _, row in df.iterrows():
        try:
            # Clean all field values
            doc = {
                "additional_urls": clean_field_value(row.get("additional_urls")),
                "body_content": clean_field_value(row.get("body_content")),
#                "body_content": clean_field_value(row.get("cleaned_body")),
                "domains": clean_field_value(row.get("domains")),
                "headings": clean_field_value(row.get("headings")),
                "id": clean_field_value(row.get("id")),
                "last_crawled_at": clean_field_value(row.get("last_crawled_at")),
                "links": clean_field_value(row.get("links")),
                "main_content": clean_field_value(row.get("main_content")),
                "meta_description": clean_field_value(row.get("meta_description")),
                "meta_keywords": clean_field_value(row.get("meta_keywords")),
                "page_title": clean_field_value(row.get("page_title")),
                "section_titles": clean_field_value(row.get("section_titles")),
                "title": clean_field_value(row.get("title")),
                "url": clean_field_value(row.get("url")),
                "url_host": clean_field_value(row.get("url_host")),
                "url_path": clean_field_value(row.get("url_path")),
                "url_path_dir1": clean_field_value(row.get("url_path_dir1")),
                "url_path_dir2": clean_field_value(row.get("url_path_dir2")),
                "url_path_dir3": clean_field_value(row.get("url_path_dir3")),
                "url_port": clean_field_value(row.get("url_port")),
                "url_scheme": clean_field_value(row.get("url_scheme"))
            }
            
            # Generate embeddings for specified fields
            for field in EMBEDDING_FIELDS:
                if field in doc and doc[field]:
                    text = doc[field]
                    if field == "body_content":
                        # Chunk the body content
                        chunks = chunk_text(text)
                        if chunks:
                            embeddings = generate_embeddings(chunks)
                            if embeddings and len(embeddings) == len(chunks):
                                doc["body_content_chunks"] = [
                                    {"text": chunk, "embedding": embedding} 
                                    for chunk, embedding in zip(chunks, embeddings)
                                ]
                            
                    else:
                        # For title and headings, embed the whole text
                        embedding = generate_embeddings([text])
                        if embedding:
                            doc[f"{field}_embedding"] = embedding[0]
            
            # Remove None values to avoid mapping conflicts
            doc = {k: v for k, v in doc.items() if v is not None}
            
            # Index the document
            es.index(
                index=INDEX_NAME,
                document=doc
            )
            print(f"Successfully indexed document {doc.get('id')}")
            
        except Exception as e:
            print(f"Error processing document {row.get('id')}: {str(e)}")
            continue
'''

def get_field_value(source,field_name):
    # Helper function to handle multi-value fields
    value = source.get(field_name)
    if isinstance(value, list):
            return " ".join(str(v) for v in value if v)                            

    return value



def process_from_elasticsearch():
    """ processing function to read from Elasticsearch"""
    # Initialize scroll
    scroll_response = es.search(
        index=SOURCE_INDEX_NAME,
        scroll=SCROLL_TIMEOUT,
        size=SCROLL_SIZE,
        body={"query": {"match_all": {}}}
    )
    
    scroll_id = scroll_response['_scroll_id']
    total_docs = scroll_response['hits']['total']['value']
    processed_docs = 0
    
    while scroll_response['hits']['hits']:
        for hit in scroll_response['hits']['hits']:
            try:
                source = hit['_source']
                doc_id = hit['_id']

                
                # Create a dictionary that mimics the row from pandas
                # This maintains compatibility with your existing code
                row = {

                    "press_release": source.get("press_release"),
                    # "headings": get_field_value(source=source,field_name="headings"),
                    "id": doc_id,
                    "crawl_date": source.get("crawl_date"),
                    "release_date": source.get("release_date"),
                    "links": get_field_value(source=source,field_name="links"),
                    # "filename": source.get("file_name"),
                    # "filename_decode": source.get("filename_decode"),
                    # "extracted_pdf": source.get("extracted_pdf"),
                    # "meta_description": source.get("meta_description"),
                    # "meta_keywords": source.get("meta_keywords"),
                    # "page_title": source.get("page_title"),
                    # "section_titles": source.get("section_title"),
                    "title": source.get("title"),
                    "url": source.get("url"),
                    # "url_host": source.get("url_host"),
                    # "url_path": source.get("url_path"),
                    # "url_path_dir1": source.get("url_path_dir1"),
                    # "url_path_dir2": source.get("url_path_dir2"),
                    # "url_path_dir3": source.get("url_path_dir3"),
                    # "url_port": source.get("url_port"),
                    # "url_scheme": source.get("url_scheme")
                }
                
                # Clean all field values
                doc = {
                    "press_release": clean_field_value(row.get("press_release")),
                    # "headings": row.get("headings"),
                    "id": clean_field_value(row.get("id")),
                    "crawl_date": clean_field_value(row.get("crawl_date")),
                    "release_date": clean_field_value(row.get("release_date")),
                    "links": clean_field_value(row.get("links")),
                    
                    # "meta_description": clean_field_value(row.get("meta_description")),
                    # "meta_keywords": clean_field_value(row.get("meta_keywords")),
#                    "page_title": clean_field_value(row.get("page_title")),
#                    "section_titles": clean_field_value(row.get("section_titles")),
                    "title": clean_field_value(row.get("title")),
                    "url": clean_field_value(row.get("url"))

                }
                
                # Generate embeddings for specified fields
                for field in EMBEDDING_FIELDS:
                    if field in doc and doc[field]:
                        text = doc[field]
                        if field == "press_release":
                            # Chunk the body content
                            chunks = chunk_text(text)
                            if chunks:
                                embeddings = generate_embeddings(chunks)
                                if embeddings and len(embeddings) == len(chunks):
                                    doc["press_release_chunks"] = [
                                        {"text": chunk, "embedding": embedding} 
                                        for chunk, embedding in zip(chunks, embeddings)
                                    ]
                        else:
                            # For title and headings, embed the whole text
                            embedding = generate_embeddings([text])
                            if embedding:
                                doc[f"{field}_embedding"] = embedding[0]
                
                # Remove None values to avoid mapping conflicts
                doc = {k: v for k, v in doc.items() if v is not None}
                
                # Index the document
                es.index(
                    index=INDEX_NAME,
                    id=doc_id,  # Preserve the original document ID
                    body=doc
                )
                processed_docs += 1
                print(f"Processed document {processed_docs}/{total_docs}: {doc_id}")
                
            except Exception as e:
                print(f"Error processing document {doc_id}: {str(e)}")
                continue
        
        # Get the next batch of documents
        scroll_response = es.scroll(
            scroll_id=scroll_id,
            scroll=SCROLL_TIMEOUT
        )
        scroll_id = scroll_response['_scroll_id']
    
    # Clear the scroll
    es.clear_scroll(scroll_id=scroll_id)

##################################################################

if __name__ == "__main__":
    
    start_time = time.time()

    es.indices.create(index=INDEX_NAME, body=index_mapping)
#    process_csv()
    process_from_elasticsearch()

    end_time = time.time()
    duration = end_time - start_time
    print(f"Indexing complete! Total time: {timedelta(seconds=duration)}")
   
    
    