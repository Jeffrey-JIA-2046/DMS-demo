using System;
using System.IO;
using System.Net;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Emc.Documentum.FS.DataModel.Core;
using Emc.Documentum.FS.DataModel.Core.Content;
using Emc.Documentum.FS.DataModel.Core.Context;
using Emc.Documentum.FS.Runtime.Context;
using Emc.Documentum.FS.Runtime.Ucf;
using Emc.Documentum.FS.DataModel.Core.Profiles;
using Emc.Documentum.FS.Services.Core;

namespace AutomatedSmartCapture.ExportTools.Documentum
{
    public partial class ContentUtil
    {
        // Instantiate DFS Content object based on transfer mode
        public static Content GetContent(string format, OperationOptions options, byte[] contents)
        {
            Content content = null;

            ContentTransferProfile transferProfile = (ContentTransferProfile)options.ContentTransferProfile;
            if (transferProfile != null)
            {


                content = GetDataHandlerContent(contents, format);
                    
             
            }
            return content; 
        }

        // Transform the DFS Content object to a local file
        public static FileInfo AsFile(Content content)
        {
            FileInfo fileInfo = null;
            if (content is UcfContent)
            {
                fileInfo = new FileInfo(((UcfContent)content).LocalFilePath);
            }
            else
            {
                string tempFilePath = Path.Combine(Path.GetTempPath(), "dfs-" + Guid.NewGuid().ToString() + ".tmp");
                fileInfo = new FileInfo(tempFilePath);

                if (content is BinaryContent)
                {
                    BinaryContent binaryContent = (BinaryContent)content;
                    using (BinaryWriter binWriter = new BinaryWriter(fileInfo.Open(FileMode.Create)))
                    {
                        binWriter.Write(binaryContent.Value);
                        binWriter.Close();
                    }
                }
                else if (content is UrlContent)
                {
                    UrlContent urlContent = (UrlContent)content;
                    DownloadContent(urlContent.Url, fileInfo.Open(FileMode.Create));
                }
            }

            return fileInfo;
        }

        public static BinaryContent GetBinaryContent(string filepath, string format)
        {
            BinaryContent content = new BinaryContent();
            content.Value = GetByteArray(filepath);
            content.Format = format;
            content.PageNumber = 0;
            content.RenditionType = RenditionType.PRIMARY;
            return content;
        }

        private static DataHandlerContent GetDataHandlerContent(byte[] contents, string format)
        {
            DataHandlerContent content = new DataHandlerContent();
            content.Value = contents;
            content.Format = format;
            content.PageNumber = 0;
            content.RenditionType = RenditionType.PRIMARY;
            return content;
        }

        private static UcfContent GetUcfContent(string filepath, string format, ActivityInfo activityInfo)
        {
            UcfContent content = new UcfContent();
            content.LocalFilePath = filepath;
            content.Format = format;
            content.PageNumber = 0;
            content.RenditionType = RenditionType.PRIMARY;
            content.ActivityInfo = activityInfo;
            return content;
        }

        private static byte[] GetByteArray(string filepath)
        {
            byte[] buffer;
            FileStream fileStream = new FileStream(filepath, FileMode.Open, FileAccess.Read);
            try
            {
                int length = (int)fileStream.Length; 
                buffer = new byte[length];          
                int count;                           
                int sum = 0;

                while ((count = fileStream.Read(buffer, sum, length - sum)) > 0)
                {
                    sum += count;
                }
            }
            finally
            {
                fileStream.Close();
            }
            return buffer;
        }

        private static void DownloadContent(string url, Stream stream)
        {
            WebRequest objRequest = HttpWebRequest.Create(url);
            WebResponse objResponse = objRequest.GetResponse();

            Stream Reader = objResponse.GetResponseStream();

            byte[] RecvBuffer = new byte[10240];
            int nBytes;
            while (((nBytes = Reader.Read(RecvBuffer, 0, RecvBuffer.Length)) > 0))
            {
                stream.Write(RecvBuffer, 0, nBytes);
            }
            stream.Close();
            Reader.Close();
        }
    }
}
