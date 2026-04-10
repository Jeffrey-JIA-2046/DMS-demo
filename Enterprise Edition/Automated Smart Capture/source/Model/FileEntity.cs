using Emc.Documentum.FS.DataModel.Core.Content;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Collections;
using System.IO;

namespace AutomatedSmartCapture.ExportTools.Documentum
{
    public class FileEntity
    {
        public String FileName { get; set; }
        public String Source { get; set; }
        public String docCategory { get; set; }
        public Hashtable StringProperties { get; set; }
        public Hashtable IntProperties { get; set; }
        public Hashtable DateProperties { get; set; }
        public Content FileContent { get; set; }
        public String TargetFolderPath { get; set; }
        public String ContentType { get; set; }


        public FileEntity(string source) 
        {
            Source = source;
            FileName = Path.GetFileName(Source);
            ContentType = ContentUtil.GetFileFormat(Source);
            FileContent = ContentUtil.GetBinaryContent(Source, ContentType);

            StringProperties = new Hashtable();
            IntProperties = new Hashtable();
            DateProperties = new Hashtable();  
        }
    }
}
