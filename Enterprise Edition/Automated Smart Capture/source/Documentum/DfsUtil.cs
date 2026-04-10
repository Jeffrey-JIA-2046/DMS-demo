using Emc.Documentum.FS.DataModel.Core;
using Emc.Documentum.FS.DataModel.Core.Content;
using Emc.Documentum.FS.DataModel.Core.Context;
using Emc.Documentum.FS.DataModel.Core.Profiles;
using Emc.Documentum.FS.DataModel.Core.Properties;
using Emc.Documentum.FS.DataModel.Core.Query;
using Emc.Documentum.FS.Runtime.Context;
using Emc.Documentum.FS.Runtime.Ucf;
using Emc.Documentum.FS.Services.Core;
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using AutomatedSmartCapture;

namespace AutomatedSmartCapture.ExportTools.Documentum
{
    public class DfsUtil
    {
        public String repository { get; set; }
        public String userName { get; set; }
        public String password { get; set; }
        public String serverURI { get; set; }
        public String targetFolderPath { get; set; }
        public IObjectService objectService { get; set; }
        public IServiceContext serviceContext { get; set; }
        public RepositoryStatusInfo repStatusInfo { get; set; }

        public DfsUtil(string serverURI, string userName, string password, string repository)
        {
            this.serverURI = serverURI;
            this.userName = userName;
            this.password = password;
            this.repository = repository;

            //this.serviceContext = this.NewServiceContext();
            this.serviceContext = this.GetServiceContext(userName, password, repository);
            this.objectService = this.createObjectService(serviceContext);

            QueryResult checkUserExists = this.CallQueryService(String.Format("select r_object_id from dm_user where user_login_name='{0}'", userName));
            QueryStatus queryStatus = checkUserExists.QueryStatus;
            repStatusInfo = queryStatus.RepositoryStatusInfos[0];

            if ((repStatusInfo.Status) == Status.FAILURE)
            {
                throw new DfsException(repStatusInfo.ErrorMessage);
            }
        }

        #region Service

        //private IServiceContext NewServiceContext()
        //{
        //    try
        //    {
        //        ContextFactory contextFactory = ContextFactory.Instance;
        //        IServiceContext serviceContext = contextFactory.NewContext();
        //        RepositoryIdentity repositoryIdentity =
        //            new RepositoryIdentity(repository, userName, password, "");
        //        serviceContext.AddIdentity(repositoryIdentity);
        //        //contextFactory.Register(serviceContext);
        //        return serviceContext;
        //    }
        //    catch (Exception ex)
        //    {
        //        throw ex;
        //    }
        //}

        public IServiceContext GetServiceContext(String userID, String plaintextPassword, String docbase)
        {
            try
            {
                ContextFactory contextFactory = ContextFactory.Instance;
                IServiceContext serviceContext = contextFactory.NewContext();
                RepositoryIdentity repositoryIdentity =
                    new RepositoryIdentity(docbase,
                        userID,
                        plaintextPassword,
                        "");
                serviceContext.AddIdentity(repositoryIdentity);
                //contextFactory.Register(serviceContext);
                return serviceContext;
            }
            catch (Exception ex)
            {
                throw new DfsException(ex);
            }
        }

        //private IObjectService NewObjectService(IServiceContext serviceContext)
        //{
        //    IObjectService service = ServiceFactory.Instance.GetRemoteService<IObjectService>(
        //        serviceContext, "core", serverURI);
        //    return service;
        //}


        //private IServiceContext NewControlServiceContext()
        //{
        //    ContextFactory contextFactory = ContextFactory.Instance;
        //    IServiceContext serviceContext = contextFactory.NewContext();
        //    RepositoryIdentity repositoryIdentity =
        //        new RepositoryIdentity(this.repository, this.userName,this.password, "") ;
        //    serviceContext.AddIdentity(repositoryIdentity);

        //    return serviceContext;
        //}
        //private IServiceContext NewSearchServiceContext()
        //{
        //    ContextFactory contextFactory = ContextFactory.Instance;
        //    IServiceContext serviceContext = contextFactory.NewContext();
        //    RepositoryIdentity repositoryIdentity =
        //        new RepositoryIdentity(this.repository, this.userName, this.password, "");
        //    serviceContext.AddIdentity(repositoryIdentity);

        //    return serviceContext;
        //}

        //private IVersionControlService NewVersionControlService(IServiceContext serviceContext)
        //{
        //    IVersionControlService service = ServiceFactory.Instance.GetRemoteService<IVersionControlService>(
        //        serviceContext, "core", serverURI);
        //    return service;
        //}

        public IObjectService createObjectService(IServiceContext serviceContext)
        {
            try
            {
                IObjectService service = ServiceFactory.Instance.GetRemoteService<IObjectService>(
                serviceContext, "core", serverURI);
                return service;
            }
            catch (Exception ex)
            {
                throw new DfsException(ex);
            }
        }


        //private ISearchService NewSearchService(IServiceContext serviceContext)
        //{
        //    ISearchService service = ServiceFactory.Instance.GetRemoteService<ISearchService>(
        //        serviceContext, "core", serverURI);

        //    return service;
        //}

        //public ISearchService getSearchService(IServiceContext serviceContext)
        //{
        //    ISearchService service = ServiceFactory.Instance.GetRemoteService<ISearchService>(
        //        serviceContext, "core", serverURI);

        //    return service;
        //}

        private DataPackage CreateDataObject(string format, string transferMode, FileEntity awareFile, string type)
        {
            OperationOptions options = NewOperationOptions(transferMode, false, null);

            //if (this.serviceContext == null)
            //{
            //    this.serviceContext = this.GetServiceContext(userName, password, repository);
            //}
            //if (this.objectService == null)
            //{
            //    //ServiceFactory serviceFactory = ServiceFactory.Instance;
            //    //IObjectService service = serviceFactory.GetRemoteService<IObjectService>(serviceContext, "core", serverURI);
            //    //this.objectService = service;
            //    this.objectService = createObjectService(this.serviceContext);
            //}

            //string filename = Path.GetFileName(awareFile.FileName);
            DataPackage pk = NewDataPackage(awareFile, type);
            if (pk != null)
            {
                DataPackage result = objectService.Create(pk, options);
                Console.WriteLine(result.DataObjects[0].Identity);
                return result;

            }
            else
            {
                return null;
            }
        }

        private OperationOptions NewOperationOptions(string transferModeText, bool returnContent, string postAction)
        {
            ContentTransferProfile ctp = NewContentTransferProfile(transferModeText);

            ContentProfile cp = new ContentProfile();
            cp.FormatFilter = returnContent ? FormatFilter.ANY : FormatFilter.NONE;
            cp.formatFilterSpecified = true;
            cp.PostTransferAction = postAction;

            PropertyProfile pp = new PropertyProfile();
            pp.FilterMode = PropertyFilterMode.ALL;
            pp.filterModeSpecified = true;

            OperationOptions options = new OperationOptions();
            options.Profiles = new List<Profile>() { ctp, cp, pp };
            return options;
        }

        private ContentTransferProfile NewContentTransferProfile(string transferModeText)
        {
            ContentTransferMode mode = ContentTransferMode.BASE64;
            if (ContentTransferMode.BASE64.ToString().Equals(transferModeText))
            {
                mode = ContentTransferMode.BASE64;
            }
            else if (ContentTransferMode.MTOM.ToString().Equals(transferModeText))
            {
                mode = ContentTransferMode.MTOM;
            }
            else if (ContentTransferMode.UCF.ToString().Equals(transferModeText))
            {
                mode = ContentTransferMode.UCF;
            }

            ContentTransferProfile ctp = new ContentTransferProfile();
            ctp.TransferMode = mode;
            ctp.transferModeSpecified = true;

            if (ContentTransferMode.UCF.Equals(mode))
            {
                // Client orchestrated UCF mode. Here we use DFS SDK library UcfConnection to get the new UCF ID.
                UcfConnection conn = new UcfConnection(new Uri(UriUtil.UcfServerUri));
                ActivityInfo ai = new ActivityInfo();
                ai.ActivityId = conn.GetUcfId();
                ai.AutoCloseConnection = true;
                ai.SessionId = conn.GetJsessionId();

                ctp.ActivityInfo = ai;
            }
            return ctp;
        }

        private DataPackage NewDataPackage(FileEntity fileEntity, string objectType)
        {
            DataObject dataObject = getDataObject(fileEntity, objectType);

            if (dataObject != null)
            {
                // add the folder to link to as a ReferenceRelationship  
                ObjectPath objectPath = new ObjectPath(fileEntity.TargetFolderPath);
                ObjectIdentity sampleFolderIdentity = new ObjectIdentity(objectPath, this.repository);
                ReferenceRelationship sampleFolderRelationship = new ReferenceRelationship();
                sampleFolderRelationship.Name = Relationship.RELATIONSHIP_FOLDER;
                sampleFolderRelationship.Target = sampleFolderIdentity;
                sampleFolderRelationship.TargetRole = Relationship.ROLE_PARENT;
                dataObject.Relationships.Add(sampleFolderRelationship);
                dataObject.Contents.Add(fileEntity.FileContent);
                DataPackage dataPackage = new DataPackage(dataObject);

                return dataPackage;
            }
            else
            {
                return null;
            }
        }

        private DataObject getDataObject(FileEntity fileEntity, string objectType)
        {
            try
            {
                ObjectIdentity sampleObjId = new ObjectIdentity(this.repository);
                DataObject dataObject = new DataObject(sampleObjId, objectType);

                foreach (DictionaryEntry entry in fileEntity.StringProperties)
                {
                    dataObject.Properties.Set(entry.Key.ToString(), entry.Value);
                }
                foreach (DictionaryEntry entry in fileEntity.IntProperties)
                {
                    dataObject.Properties.Set(entry.Key.ToString(), Convert.ToInt32(entry.Value));
                }
                foreach (DictionaryEntry entry in fileEntity.DateProperties)
                {
                    dataObject.Properties.Set(entry.Key.ToString(), Convert.ToDateTime(entry.Value));
                }

                return dataObject;
            }
            catch (Exception ex)
            {
                Program.HandleGenericException(ex, String.Format("Error on Importing {0}.", fileEntity.FileName));
                return null;
            }
        }

        //public DataPackage getFileObject(string id)
        //{
        //    ObjectId objectId = new ObjectId(id);
        //    ObjectIdentity objectIdentity = new ObjectIdentity(objectId, this.repository);
        //    ObjectIdentitySet objectIdentitySet = new ObjectIdentitySet(objectIdentity);

        //    PropertyProfile propertyProfile = new PropertyProfile();
        //    propertyProfile.FilterMode = PropertyFilterMode.SPECIFIED_BY_INCLUDE;
        //    propertyProfile.IncludeProperties.Add("object_name");

        //    OperationOptions operationOptions = new OperationOptions();
        //    operationOptions.Profiles.Add(propertyProfile);

        //    IObjectService service = NewObjectService(NewServiceContext());
        //    DataPackage dataPackage = service.Get(objectIdentitySet, operationOptions);

        //    return dataPackage;
        //}

        //public QueryResult SimplePassthroughQuery(string queryString)
        //{
        //    QueryResult queryResult = default;
        //    try
        //    {
        //        int startingIndex = 0;
        //        int maxResults = 300;
        //        int maxResultsPerSource = 100;

        //        PassthroughQuery q = new PassthroughQuery();
        //        q.QueryString = queryString;
        //        q.AddRepository(this.repository);

        //        QueryExecution queryExec = new QueryExecution(startingIndex,
        //                                                      maxResults,
        //                                                      maxResultsPerSource);
        //        Logs.Add(DateTime.Now, "Query Execution has been created successfully.");
        //        queryExec.CacheStrategyType = CacheStrategyType.NO_CACHE_STRATEGY;


        //        ISearchService service = NewSearchService(NewSearchServiceContext());
        //        queryResult = service.Execute(q, queryExec, null);
        //        Logs.Add(DateTime.Now, "Search service has been executed successfully.");

        //        QueryStatus queryStatus = queryResult.QueryStatus;
        //        RepositoryStatusInfo repStatusInfo = queryStatus.RepositoryStatusInfos[0];
        //        if (repStatusInfo.Status == Status.FAILURE)
        //        {
        //            Logs.Add(DateTime.Now, "Query failed to return result: " + repStatusInfo.ErrorMessage + repStatusInfo.ErrorTrace);
        //            //throw new Exception("Query failed to return result.");
        //        }
        //        Logs.Add(DateTime.Now, "Query returned result successfully.");
        //        DataPackage dp = queryResult.DataPackage;
        //        Logs.Add(DateTime.Now, "DataPackage contains " + dp.DataObjects.Count + " objects.");
        //        foreach (DataObject dataObject in dp.DataObjects)
        //        {
        //            Logs.Add(DateTime.Now, dataObject.Identity.GetValueAsString());
        //        }
        //    }
        //    catch (Exception e)
        //    {
        //        Logs.Add(DateTime.Now, e.Message + e.StackTrace);
        //        //throw new Exception();
        //    }
        //    return queryResult;
        //}

        /// <summary>
        /// Demonstrates a typical scenario for calling the query service.
        /// Gets an instance of the Query service and calls the execute operation
        /// with a hard-coded query and operation options.
        /// </summary>
        public QueryResult CallQueryService(string queryString)
        {
            // Get an instance of the QueryService by passing in the service context to the service factory
            try
            {
                ServiceFactory serviceFactory = ServiceFactory.Instance;
                IQueryService querySvc = serviceFactory.GetRemoteService<IQueryService>(serviceContext, "core", serverURI);

                // Construct the query and the QueryExecution options
                PassthroughQuery query = new PassthroughQuery();
                query.QueryString = queryString;
                query.AddRepository(repository);
                QueryExecution queryEx = new QueryExecution();
                queryEx.CacheStrategyType = CacheStrategyType.DEFAULT_CACHE_STRATEGY;

                // Execute the query passing in the operation options and print the result
                OperationOptions operationOptions = null;

                QueryResult queryResult = querySvc.Execute(query, queryEx, operationOptions);
                DataPackage resultDp = queryResult.DataPackage;
                List<DataObject> dataObjects = resultDp.DataObjects;
                int numberOfObjects = dataObjects.Count;
                foreach (DataObject dObj in dataObjects)
                {
                    PropertySet docProperties = dObj.Properties;
                    String objectId = dObj.Identity.GetValueAsString();
                    //String docName = docProperties.Get("object_name").GetValueAsString();
                }
                return queryResult;
            }
            catch (Exception ex)
            {
                throw new DfsException(ex);
            }
        }

        #endregion

        #region Document Import / Manipulation

        public void CreateDocumentDirectory(string path)
        {
            string[] pathSec = path.Split(Path.AltDirectorySeparatorChar);
            string dir = "";
            string parentPath = "";

            for (int i = 1; i < pathSec.Length; i++)
            {
                dir += Path.AltDirectorySeparatorChar + pathSec[i];

                string dql = "SELECT r_object_id FROM dm_folder WHERE ANY r_folder_path = '{0}'";                
                QueryResult getFolderResult = this.CallQueryService(string.Format(dql, dir));

                if (getFolderResult.DataObjects.Count == 0)
                {
                    string dirName = Path.GetFileName(dir);
                    string dirPath = Path.GetDirectoryName(dir).Replace(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

                    try
                    {
                        ObjectIdentity objId = new ObjectIdentity(this.repository);
                        DataObject dataObject = new DataObject(objId, "dm_folder");
                        dataObject.Properties.Set("object_name", dirName);

                        ObjectPath objectPath = new ObjectPath(parentPath);
                        ObjectIdentity sampleFolderIdentity = new ObjectIdentity(objectPath, this.repository);
                        ReferenceRelationship sampleFolderRelationship = new ReferenceRelationship();
                        sampleFolderRelationship.Name = Relationship.RELATIONSHIP_FOLDER;
                        sampleFolderRelationship.Target = sampleFolderIdentity;
                        sampleFolderRelationship.TargetRole = Relationship.ROLE_PARENT;
                        dataObject.Relationships.Add(sampleFolderRelationship);

                        DataPackage dataPackage = new DataPackage(dataObject);
                        OperationOptions options = NewOperationOptions("MTOM", false, null);
                        DataPackage result = objectService.Create(dataPackage, options);
                    }
                    catch (Exception ex)
                    {
                        //string errMsg = String.Format("Failed to Create Directory {0}", path);
                        //Program.HandleGenericException(ex, errMsg);
                        throw new DfsException(ex);
                    }
                }

                parentPath = dir;
            }
        }

        //public void ImportDocument(List<FileEntity> fileList)
        //{
        //    serviceContext = this.GetServiceContext(userName, password, repository);
        //    objectService = this.createObjectService(serviceContext);

        //    string transferMode = "MTOM";
        //    DataPackage dataPackage = new DataPackage();
        //    //DateTime startImport = DateTime.Now;
        //    foreach (FileEntity fileEntity in fileList)
        //    {
        //        this.CreateDocumentDirectory(fileEntity.targetFolderPath);

        //        string format = FileUtil.GetFileFormat(fileEntity.FileName);
        //        try
        //        {
        //            dataPackage = this.CreateDataObject(format, transferMode, fileEntity, "hr_employee_document");
        //            string newObjId = (dataPackage.DataObjects[0].Identity.Value.ToString());
        //            Logging.Create(String.Format("Successfully imported {0} document{1}.", docCat, (FileList.Count > 1 ? "s" : "")));
        //            Logging.Create("Object ID: " + newObjId);
        //        }
        //        catch (Exception ex)
        //        {
        //            //string errMsg = String.Format("Error on Importing {0}.", fileEntity.FileName);
        //            //Program.HandleGenericException(ex, errMsg);
        //            throw new DfsException(ex);
        //        }
        //        System.Threading.Thread.Sleep(10);
        //    }
        //}

        public string ImportDocument(FileEntity fileEntity)
        {
            serviceContext = this.GetServiceContext(userName, password, repository);
            objectService = this.createObjectService(serviceContext);

            string transferMode = "MTOM";
            DataPackage dataPackage = new DataPackage();
            //DateTime startImport = DateTime.Now;
            
            this.CreateDocumentDirectory(fileEntity.TargetFolderPath);

            string format = ContentUtil.GetFileFormat(fileEntity.FileName);
            try
            {
                dataPackage = this.CreateDataObject(format, transferMode, fileEntity, "hr_employee_document");
                string newObjId = (dataPackage.DataObjects[0].Identity.Value.ToString());
                return newObjId;
            }
            catch (Exception ex)
            {
                throw new DfsException(ex);
            }
        }

        public void UpdateDocument(object objId, FileEntity fileEntity)
        {
            serviceContext = this.GetServiceContext(userName, password, repository);
            objectService = this.createObjectService(serviceContext);

            try
            {
                DataObject dataObject = new DataObject(new ObjectIdentity(objId, this.repository), "hr_employee_document");

                // Update default content
                dataObject.Contents.Add(fileEntity.FileContent);

                // Update target folder path, if needed
                if (fileEntity.TargetFolderPath != null)
                {
                    ObjectPath objectPath = new ObjectPath(fileEntity.TargetFolderPath);
                    ObjectIdentity folderIdentity = new ObjectIdentity(objectPath, this.repository);
                    ReferenceRelationship folderRelationship = new ReferenceRelationship();
                    folderRelationship.Name = Relationship.RELATIONSHIP_FOLDER;
                    folderRelationship.Target = folderIdentity;
                    folderRelationship.TargetRole = Relationship.ROLE_PARENT;
                    dataObject.Relationships.Add(folderRelationship);
                }

                // Update properties, if needed
                foreach (DictionaryEntry entry in fileEntity.StringProperties)
                {
                    dataObject.Properties.Set(entry.Key.ToString(), (string)entry.Value);
                }
                foreach (DictionaryEntry entry in fileEntity.IntProperties)
                {
                    dataObject.Properties.Set(entry.Key.ToString(), Convert.ToInt32(entry.Value));
                }
                foreach (DictionaryEntry entry in fileEntity.DateProperties)
                {
                    dataObject.Properties.Set(entry.Key.ToString(), Convert.ToDateTime(entry.Value));
                }

                // Take the data package to update
                DataPackage dataPackage = new DataPackage(dataObject);
                objectService.Update(dataPackage, NewOperationOptions("MTOM", false, null));
            }
            catch (Exception ex)
            {
                throw new DfsException(ex);
            }
        }

        public bool DeleteDocument(string queryDQL)
        {
            QueryResult result = this.CallQueryService(queryDQL);

            IObjectService service = this.createObjectService(this.serviceContext);
            foreach (DataObject package in result.DataObjects)
            {
                try
                {
                    ObjectIdentitySet objectIdentitySet = new ObjectIdentitySet(package.Identity);

                    DeleteProfile deleteProfile = new DeleteProfile();
                    deleteProfile.IsDeepDeleteFolders = true;
                    deleteProfile.IsDeepDeleteChildrenInFolders = true;
                    OperationOptions operationOptions = new OperationOptions();
                    operationOptions.DeleteProfile = deleteProfile;
                    service.Delete(objectIdentitySet, operationOptions);
                }
                catch (Exception ex)
                {
                    throw new Exception(ex.Message);

                }
            }

            return true;
        }

        #endregion

        #region Data Retrieval

        public List<string> PopulateListItems(string table, string field, string condition = "")
        {
            string dql = "SELECT r_object_id,{0} FROM {1}" + (condition is "" ? "{2}" : " WHERE {2}");
            QueryResult result = this.CallQueryService(String.Format(dql, field, table, condition));
            List<string> list = result?.DataObjects.Select(obj => obj.Properties.Get(field).GetValueAsString()).ToList();

            return list;
        }

        public Dictionary<string, string> PopulateDictItems(string table, string keyField, string valueField, string condition = "")
        {
            string dql = "SELECT r_object_id,{0},{1} FROM {2}" + (condition is "" ? "{3}" : " WHERE {3}");
            QueryResult result = this.CallQueryService(String.Format(dql, keyField, valueField, table, condition));
             
            Dictionary<string, string> dict = new Dictionary<string, string>();
            foreach (var data in result.DataObjects)
            {
                dict.Add(data.Properties.Get(keyField).GetValueAsString(), data.Properties.Get(valueField).GetValueAsString());
            }
            return dict;
        }

        public List<DataObject> RetrieveDocObjectList(int returnAmount, string condition = "")
        {
            // Do not need any query for getting an empty list
            if (returnAmount == 0)
            {
                return new List<DataObject>();
            }

            // Restrict number of returned records in order to prevent MaxReceivedMessageSize being exceeded
            string dqlBase = "SELECT r_object_id, object_name FROM hr_employee_document WHERE {0} ENABLE (RETURN_TOP {1})";
            QueryResult result = this.CallQueryService(String.Format(dqlBase, condition, returnAmount));
            var dataObjList = result.DataObjects;

            // Iterations may be required due to limited number of records per retrieval from DFS
            while (dataObjList.Count < returnAmount)
            {
                var objIds = dataObjList.Select(obj => obj.Identity.GetValueAsString());
                string dql = String.Format(dqlBase, String.Format("{0} AND NOT r_object_id IN ('{1}')", condition, String.Join("','", objIds)), returnAmount);
                result = this.CallQueryService(dql);
                dataObjList.AddRange(result.DataObjects);
            }

            return dataObjList.ToList();
        }

        public byte[] RetrieveDocumentContent(object objId)
        {
            serviceContext = this.GetServiceContext(userName, password, repository);
            objectService = this.createObjectService(serviceContext);

            var objIdSet = new ObjectIdentitySet();
            objIdSet.AddIdentity(new ObjectIdentity(new ObjectId(objId.ToString()), repository));

            DataPackage pk = objectService.Get(objIdSet, NewOperationOptions("MTOM", true, null));
            DataObject obj = pk.DataObjects[0];
            Content content = obj.Contents[0];

            return content.GetAsByteArray();
        }

        #endregion

        #region Encryption / Decryption

        //public string EncryptString(string origStr)
        //{
        //    string dql = "SELECT r_object_id,object_name,locale_value FROM d2_dictionary_value WHERE dictionary_name='hr_encrypt_decrypt'";
        //    QueryResult result = this.CallQueryService(dql);

        //    String[] algorithm = FetchDataDictValue(result, "algorithm").Split('/');
        //    String key = FetchDataDictValue(result, "key");
        //    String iv = FetchDataDictValue(result, "IV");

        //    if (algorithm.Contains("AES"))
        //    {
        //        using (AesManaged aes = CreateAes(algorithm, key, iv))
        //        {
        //            ICryptoTransform encryptor = aes.CreateEncryptor();
        //            using (MemoryStream ms = new MemoryStream())
        //            {
        //                using (CryptoStream cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
        //                {
        //                    using (StreamWriter sw = new StreamWriter(cs))
        //                    {
        //                        sw.Write(origStr);
        //                    }
        //                    return Convert.ToBase64String(ms.ToArray());
        //                }
        //            }
        //        }
        //    }
        //    else
        //    {
        //        throw new Exception("Unable to handle non-AES algorithm for encryption.");
        //    }
        //}

        //public string DecryptString(string inputStr, out bool isDecrypted)
        //{
        //    byte[] decoded = Convert.FromBase64String(inputStr);

        //    string dql = "SELECT r_object_id,object_name,locale_value FROM d2_dictionary_value WHERE dictionary_name='hr_encrypt_decrypt'";
        //    QueryResult result = this.CallQueryService(dql);

        //    String[] algorithm = FetchDataDictValue(result, "algorithm").Split('/');
        //    String key = FetchDataDictValue(result, "key");
        //    String iv = FetchDataDictValue(result, "IV");

        //    try
        //    {
        //        if (algorithm.Contains("AES"))
        //        {
        //            using (AesManaged aes = CreateAes(algorithm, key, iv))
        //            {
        //                ICryptoTransform decryptor = aes.CreateDecryptor();
        //                using (MemoryStream ms = new MemoryStream(decoded))
        //                {
        //                    using (CryptoStream cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read))
        //                    {
        //                        using (StreamReader reader = new StreamReader(cs))
        //                        {
        //                            isDecrypted = true;
        //                            return reader.ReadToEnd();
        //                        }
        //                    }
        //                }
        //            }
        //        }
        //        else
        //        {
        //            throw new Exception("Unable to handle non-AES algorithm for decryption.");
        //        }
        //    }
        //    catch (CryptographicException)
        //    {
        //        // Return the decoded value if it is not valid for decryption
        //        isDecrypted = false;
        //        return Encoding.UTF8.GetString(decoded);
        //    }
        //}

        //private string FetchDataDictValue(QueryResult source, string objectKey)
        //{
        //    List<DataObject> dataDict = source.DataObjects;
        //    DataObject field = dataDict.Where(obj => obj.Properties.Get("object_name").GetValueAsString() == objectKey).FirstOrDefault();
        //    string value = field.Properties.Get("locale_value").GetValueAsString();

        //    return value.Substring(2);
        //}

        //private AesManaged CreateAes(string[] algorithm, string key, string iv)
        //{
        //    AesManaged aes = new AesManaged();

        //    if (algorithm.Contains("CBC"))
        //    {
        //        aes.Mode = CipherMode.CBC;
        //    }
        //    if (algorithm.Contains("PKCS7Padding"))
        //    {
        //        aes.Padding = PaddingMode.PKCS7;
        //    }
        //    aes.Key = Encoding.UTF8.GetBytes(key);
        //    aes.IV = Encoding.UTF8.GetBytes(iv.Substring(0, 16));

        //    return aes;            
        //}

        #endregion
    }

    public class DfsException : Exception
    {
        public DfsException(Exception innerException) : base(null, innerException) { }

        public DfsException(string message) : base(null, new Exception(message)) { }
    }
}
