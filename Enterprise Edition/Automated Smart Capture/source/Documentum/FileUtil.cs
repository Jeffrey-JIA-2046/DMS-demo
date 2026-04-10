using System;
using System.IO;
using System.Collections.Generic;
using System.Text;
using System.Web;
using static System.Net.WebRequestMethods;

namespace AutomatedSmartCapture.ExportTools.Documentum
{
    public class FileFormat
    {
        public const string Word = "msw8";
        public const string PowerPoint = "ppt8";
        public const string Excel = "excel8book";
        public const string WordX = "msw12";
        public const string PowerPointX = "ppt12";
        public const string ExcelX = "excel12book";
        public const string Binary = "binary";
        public const string Bin = "bin";
        public const string Zip = "zip";
        public const string Text = "crtext";
        public const string Pdf = "pdf";
        public const string Jpeg = "jpeg";
        public const string Tif = "tiff";
        public static Func<string, string> Original = ext => ext.ToLower().TrimStart('.');
    }

    static partial class ContentUtil
    {
        // This is a sample utility to map the dos extension to content format. Full mapping is defined in dm_format table.
        public static string GetFileFormat(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
            {
                throw new ArgumentException("File name should not be null or empty");
            }
            string extension = Path.GetExtension(fileName).ToUpper();
            switch (extension)
            {
                case ".DOC":
                    return FileFormat.Word;
                case ".DOCX":
                    return FileFormat.WordX;
                case ".PPT":
                    return FileFormat.PowerPoint;
                case ".PPTX":
                    return FileFormat.PowerPointX;
                case ".XLS":
                    return FileFormat.Excel;
                case ".XLSX":
                    return FileFormat.ExcelX;
                case ".BIN":
                    return FileFormat.Bin;
                case ".ZIP":
                    return FileFormat.Zip;
                case ".TXT":
                case ".XML":
                    return FileFormat.Text;
                case ".PDF":
                    return FileFormat.Pdf;
                case ".JPG":
                case ".JPEG":
                    return FileFormat.Jpeg;
                case ".TIF":
                case ".TIFF":
                    return FileFormat.Tif;
                case ".PNG":
                case ".BMP":
                case ".GIF":
                case ".MSG":
                    return FileFormat.Original(extension);
                default:
                    return FileFormat.Binary;
            }
        }
    }
}
