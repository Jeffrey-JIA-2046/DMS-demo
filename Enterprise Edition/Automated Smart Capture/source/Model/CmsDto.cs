using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutomatedSmartCapture.Model.Cms
{
    public class TableInfo
    {
        [JsonProperty("misTypeId")]
        public string TypeID { get; set; }

        [JsonProperty("misTypeName")]
        public string TypeName { get; set; }

        [JsonProperty("misTypeLabel")]
        public string Label { get; set; }

        [JsonProperty("misColumnList")]
        public TableColumn[] Columns { get; set; }
    }
    
    public class TableColumn
    {
        [JsonProperty("misColumnId")]
        public string ID { set; get; }

        [JsonProperty("misColumnName")]
        public string Name { get; set; }

        [JsonProperty("misColumnLabel")]
        public string Label { get; set; }

        [JsonProperty("misColumnType")]
        public string Type { get; set; }

        [JsonProperty("misColumnLength")]
        public int Length { get; set; }

        [JsonProperty("misColumnDictionary")]
        public string Dictionary { get; set; }

        [JsonProperty("misColumnAllowEmpty")]
        public string AllowEmpty { get; set; }
    }

    public class Folder
    {
        [JsonProperty("misFolderId")]
        public string ID { set; get; }

        [JsonProperty("misFolderName")]
        public string Name { get; set; }

        [JsonProperty("misFolderFullPath")]
        public string FullPath { get; set; }

        [JsonProperty("misFolderParentId")]
        public string ParentID { get; set; }

        [JsonProperty("misPermissionId")]
        public string PermissionID { get; set; }
    }

    public class TreeData
    {
        [JsonProperty("misFolderName")]
        public string FolderName { get; set; }

        [JsonProperty("children")]
        public object[] Children { get; set; }

        [JsonProperty("path")]
        public string Path { get; set; }

        [JsonProperty("misFolderId")]
        public string FolderID { get; set; }
    }

    public class TableRecord
    {
        //[JsonProperty("fileId")]
        //public string FileID { get; set; }

        [JsonProperty("tableId")]
        public string TypeID { get; set; }

        //[JsonProperty("folder_id")]
        //public string FolderID { set; get; }

        [JsonProperty("path")]
        public string Path { get; set; }

        //[JsonProperty("tableColumns")]
        //public TableColumn[] Columns { get; set; }

        //[JsonIgnore]
        //public string[] Keys { get; set; }

        //[JsonIgnore]
        //public object[] Values { get; set; }

        [JsonExtensionData]
        public Dictionary<string, object> Properties { get; set; }
    }
}