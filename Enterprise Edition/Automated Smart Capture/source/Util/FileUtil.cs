using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Web;

namespace AutomatedSmartCapture
{
    public static class FileUtil
    {
        public static bool IsImage(string file)
        {
            string mime = MimeMapping.GetMimeMapping(file);
            return mime.StartsWith("image/");
        }

        public static void Delete(FileInfo fileObj)
        {
            try
            {
                fileObj.Delete();
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error on deleting file {1}: {0}", ex.Message, fileObj.Name));
            }
        }

        public static void Delete(string file)
        {
            Delete(new FileInfo(file));
        }
    }
}
