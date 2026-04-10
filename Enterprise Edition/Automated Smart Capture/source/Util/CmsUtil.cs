using AutomatedSmartCapture.Model.Cms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
//using System.Net.Http.Headers;
using System.Net.Http.Headers;
using System.Text;
using System.Windows.Forms;
using System.Web;

namespace AutomatedSmartCapture.Util
{
    public class CmsUtil
    {
        private string _serverURI { get; set; }
        private string _userName { get; set; }
        private string _displayName { get; set; }
        private string _userRole { get; set; }
        private bool _isAdmin { get; set; }
        private string _basicAuthHeader { get; set; }
        private string _defaultApproverId { get; set; }
        private string _defaultSupervisorId { get; set; }

        public string CurrentUsername => _userName;
        public string CurrentDisplayName => _displayName;

        public CmsUtil(string serverURI)
        {
            _serverURI = (serverURI ?? string.Empty).TrimEnd('/');
        }

        public bool Authenticate(string userName, string password/*, string loginType*/)
        {
            try
            {
                string encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(userName + ":" + password));
                _basicAuthHeader = "Basic " + encoded;

                HttpResponseMessage response = SendRequest(HttpMethod.Get, "/api/me");
                string userJson = ReadJsonResponse(response);
                var me = (JObject)JsonConvert.DeserializeObject(userJson);

                _userName = (string)me["username"];
                _displayName = (string)me["displayName"];
                _userRole = (string)me["role"];
                _isAdmin = string.Equals(_userRole, "SYS_ADMIN", StringComparison.OrdinalIgnoreCase);

                ResolveDefaultRoutingTargets();
                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Server authentication failed: " + ex.Message);
                Logging.Write(ex, "DMS authentication failed.");
                return false;
            }
        }

        private HttpResponseMessage SendRequest(HttpMethod method, string path, string payload = null)
        {
            Logging.Write("Request Path: " + path);

            // Create an Http request
            HttpRequestMessage request = new HttpRequestMessage(method, _serverURI + path);

            // Perform authorization by adding Basic auth header
            request.Headers.Authorization = AuthenticationHeaderValue.Parse(_basicAuthHeader);

            // Fill in the request data content, if any
            if (payload != null)
            {
                request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
            }

            // Ready to send the request and wait for response
            using (var client = new HttpClient())
            {
                HttpResponseMessage response = client.SendAsync(request).GetAwaiter().GetResult();
                return response;
            }
        }

        private string ReadJsonResponse(HttpResponseMessage response)
        {
            Logging.Write("Response: " + response.StatusCode);

            if (!response.IsSuccessStatusCode)
            {
                string responseBody = string.Empty;
                try
                {
                    responseBody = response.Content.ReadAsStringAsync().Result;
                }
                catch
                {
                    // Best effort: preserve original behavior when response body cannot be read.
                }

                string message = string.Format(
                    "HTTP {0} ({1}){2}",
                    (int)response.StatusCode,
                    response.ReasonPhrase,
                    string.IsNullOrWhiteSpace(responseBody) ? string.Empty : ": " + responseBody
                );

                throw new CmsApiException(message);
            }

            return response.Content.ReadAsStringAsync().Result;
        }

        private string ReadResponse(HttpResponseMessage response)
        {
            return ReadJsonResponse(response);
        }

        public JObject[] GetAllTypes()
        {
            try
            {
                HttpResponseMessage response = SendRequest(HttpMethod.Get, "/api/folders/tree");
                string typesJson = ReadResponse(response);

                var typeObjs = JsonConvert.DeserializeObject<JObject[]>(typesJson);
                return typeObjs;
            }
            catch (TokenExpiredException)
            {
                // Do it again
                return GetAllTypes();
            }
        }

        public TableInfo GetTableInfo(string typeId)
        {
            try
            {
                // Legacy compatibility shim for old callers.
                return new TableInfo
                {
                    TypeID = typeId,
                    TypeName = typeId,
                    Label = typeId,
                    Columns = Array.Empty<TableColumn>()
                };
            }
            catch (TokenExpiredException)
            {
                // Do it again
                return GetTableInfo(typeId);
            }
        }

        public Folder[] GetFolderList()
        {
            try
            {
                HttpResponseMessage response = SendRequest(HttpMethod.Get, "/api/folders/tree");
                string foldersJson = ReadResponse(response);

                var roots = JsonConvert.DeserializeObject<List<DmsFolderNode>>(foldersJson) ?? new List<DmsFolderNode>();
                var flat = new List<Folder>();
                FlattenFolders(roots, null, flat);
                var folderObjs = flat.ToArray();
                return folderObjs;
            }
            catch (TokenExpiredException)
            {
                // Do it again
                return GetFolderList();
            }
        }

        public void UploadDocument(string filePath, Dictionary<string, object> metadata, string category = null)
        {
            var stringMetadata = metadata?.ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value == null ? string.Empty : Convert.ToString(kvp.Value, CultureInfo.InvariantCulture)
            ) ?? new Dictionary<string, string>();

            UploadDocument(filePath, category, stringMetadata);
        }

        public void UploadDocument(string filePath, TableInfo table, Dictionary<string, object> metadata, Folder folder, bool all = false, bool autolink = false)
        {
            var category = table?.Label ?? table?.TypeName;
            UploadDocument(filePath, metadata, category);
        }

        private void UploadDocument(string filePath, string category, Dictionary<string, string> metadata)
        {
            if (string.IsNullOrWhiteSpace(Program.AppSettings.DmsTargetFolderId))
            {
                throw new CmsApiException("DmsTargetFolderId is not configured.");
            }

            string targetFolderId = ResolveTargetFolderId(Program.AppSettings.DmsTargetFolderId);

            string owner = string.IsNullOrWhiteSpace(_displayName) ? _userName : _displayName;
            string baseTitle = Path.GetFileNameWithoutExtension(filePath);
            string title = baseTitle + "_" + DateTime.Now.ToString("yyyyMMddHHmmssfff", CultureInfo.InvariantCulture);
            string description = category ?? "Scanned document";
            string documentDate = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            string expiryDate = DateTime.Now.AddYears(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

            var payloadMetadata = metadata == null
                ? new Dictionary<string, string>()
                : new Dictionary<string, string>(metadata);

            var requestModel = new
            {
                title,
                description,
                owner,
                category,
                documentDate,
                expiryDate,
                tags = Array.Empty<string>(),
                folderId = targetFolderId,
                approverId = _defaultApproverId,
                supervisorId = _defaultSupervisorId,
                metadata = payloadMetadata
            };

            // Make up the form data payload
            var multipart = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(File.ReadAllBytes(filePath));
            fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(MimeMapping.GetMimeMapping(filePath));
            multipart.Add(fileContent, "file", Path.GetFileName(filePath));
            multipart.Add(new StringContent(JsonConvert.SerializeObject(requestModel), Encoding.UTF8, "application/json"), "metadata");

            try
            {
                // Create an Http request
                HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, _serverURI + "/api/documents");

                // Perform authorization by adding Basic auth header
                request.Headers.Authorization = AuthenticationHeaderValue.Parse(_basicAuthHeader);
                
                // Fill in the request form data content
                request.Content = multipart;

                // Ready to send the request and wait for response
                using (var client = new HttpClient())
                {
                    HttpResponseMessage response = client.SendAsync(request).GetAwaiter().GetResult();
                    ReadJsonResponse(response);
                }
            }
            catch (TokenExpiredException)
            {
                // Do it again
                UploadDocument(filePath, category, metadata);
            }
        }

        private string ResolveTargetFolderId(string configuredFolderToken)
        {
            string token = (configuredFolderToken ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new CmsApiException("DmsTargetFolderId is not configured.");
            }

            HttpResponseMessage response = SendRequest(HttpMethod.Get, "/api/folders/tree");
            string foldersJson = ReadJsonResponse(response);
            var roots = JsonConvert.DeserializeObject<List<DmsFolderNode>>(foldersJson) ?? new List<DmsFolderNode>();

            var folderRefs = new List<FolderRef>();
            FlattenFolderRefs(roots, string.Empty, folderRefs);

            var byId = folderRefs.FirstOrDefault(f => string.Equals(f.Id, token, StringComparison.OrdinalIgnoreCase));
            if (byId != null)
            {
                return byId.Id;
            }

            var byName = folderRefs.Where(f => string.Equals(f.Name, token, StringComparison.OrdinalIgnoreCase)).ToList();
            if (byName.Count == 1)
            {
                return byName[0].Id;
            }

            var normalizedToken = token.Replace("\\", "/").Trim('/');
            var byPath = folderRefs.FirstOrDefault(f => string.Equals(f.Path, normalizedToken, StringComparison.OrdinalIgnoreCase));
            if (byPath != null)
            {
                return byPath.Id;
            }

            if (byName.Count > 1)
            {
                throw new CmsApiException("Configured DMS folder is ambiguous. Use folder id or full path. Value: " + token);
            }

            throw new CmsApiException("Configured DMS folder was not found. Value: " + token);
        }

        private void FlattenFolderRefs(IEnumerable<DmsFolderNode> nodes, string parentPath, List<FolderRef> refs)
        {
            if (nodes == null)
            {
                return;
            }

            foreach (var node in nodes)
            {
                string currentPath = string.IsNullOrWhiteSpace(parentPath)
                    ? (node.Name ?? string.Empty)
                    : parentPath + "/" + (node.Name ?? string.Empty);

                refs.Add(new FolderRef
                {
                    Id = node.Id,
                    Name = node.Name,
                    Path = currentPath.Trim('/')
                });

                FlattenFolderRefs(node.Children, currentPath, refs);
            }
        }

        private void ResolveDefaultRoutingTargets()
        {
            if (!string.IsNullOrWhiteSpace(Program.AppSettings.DmsDefaultApproverId)
                && !string.IsNullOrWhiteSpace(Program.AppSettings.DmsDefaultSupervisorId))
            {
                _defaultApproverId = Program.AppSettings.DmsDefaultApproverId;
                _defaultSupervisorId = Program.AppSettings.DmsDefaultSupervisorId;
                return;
            }

            _defaultApproverId = ResolveDefaultUserId("/api/documents/approvers", Program.AppSettings.DmsDefaultApproverId);
            _defaultSupervisorId = ResolveDefaultUserId("/api/documents/supervisors", Program.AppSettings.DmsDefaultSupervisorId);
        }

        private string ResolveDefaultUserId(string endpoint, string configuredUserId)
        {
            if (!string.IsNullOrWhiteSpace(configuredUserId))
            {
                return configuredUserId;
            }

            HttpResponseMessage response = SendRequest(HttpMethod.Get, endpoint);
            string usersJson = ReadJsonResponse(response);
            var users = JsonConvert.DeserializeObject<List<ApproverOption>>(usersJson) ?? new List<ApproverOption>();
            if (!users.Any())
            {
                throw new CmsApiException("No eligible users returned from " + endpoint);
            }

            var byUsername = users.FirstOrDefault(u => string.Equals(u.Username, _userName, StringComparison.OrdinalIgnoreCase));
            return (byUsername ?? users.First()).Id;
        }

        private void FlattenFolders(IEnumerable<DmsFolderNode> nodes, string parentId, List<Folder> result)
        {
            if (nodes == null)
            {
                return;
            }

            foreach (var node in nodes)
            {
                result.Add(new Folder
                {
                    ID = node.Id,
                    Name = node.Name,
                    ParentID = parentId,
                    FullPath = node.Name,
                    PermissionID = null
                });

                FlattenFolders(node.Children, node.Id, result);
            }
        }

        private class DmsFolderNode
        {
            public string Id { get; set; }

            public string Name { get; set; }

            public List<DmsFolderNode> Children { get; set; }
        }

        private class ApproverOption
        {
            public string Id { get; set; }

            public string Username { get; set; }
        }

        private class FolderRef
        {
            public string Id { get; set; }

            public string Name { get; set; }

            public string Path { get; set; }
        }

        public class CmsApiException : Exception
        {
            public CmsApiException(string message, Exception innerEx = null) : base(message, innerEx)
            {

            }
        }

        public class TokenExpiredException : CmsApiException
        {
            public TokenExpiredException() : base("Token has expired!")
            {
                RegenerateToken();
            }

            private void RegenerateToken()
            {
                if (Program.AppSettings.SingleLoginMode)
                {
                    // Restart app to login again
                    MessageBox.Show("Server token has been expired. Please login again.");
                    Application.Restart();
                }
                else
                {
                    // Auto refresh token
                    Program.InitiateCmsServerConnection();
                }
            }
        }
    }
}
