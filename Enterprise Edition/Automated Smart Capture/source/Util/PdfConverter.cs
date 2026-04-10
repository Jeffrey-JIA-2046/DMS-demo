using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using iText = iTextSharp.text;
using iTextSharp.text.pdf;
using Word = Microsoft.Office.Interop.Word;
using Excel = Microsoft.Office.Interop.Excel;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;
using Outlook = Microsoft.Office.Interop.Outlook;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using AutomatedSmartCapture.ExportTools;
using AutomatedSmartCapture.Model;

namespace AutomatedSmartCapture.Util
{
    public static class PdfConverter
    {
        public static string Convert(string sourceFile)
        {
            string fileNameWithoutExt = Path.GetFileNameWithoutExtension(sourceFile);
            string outputFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "temp", fileNameWithoutExt + ".pdf");

            switch (Path.GetExtension(sourceFile).ToLowerInvariant())
            {
                case ".pdf":
                    return sourceFile;

                case ".tif":
                case ".tiff":
                    PrintImgToPdf(sourceFile, outputFilePath, ImageFormat.Tiff);
                    break;

                case ".jpg":
                    PrintImgToPdf(sourceFile, outputFilePath, ImageFormat.Jpeg);
                    break;

                case ".png":
                    PrintImgToPdf(sourceFile, outputFilePath, ImageFormat.Png);
                    break;

                case ".doc":
                case ".docx":
                    Word.PrintWordToPdf(sourceFile, outputFilePath);
                    break;

                case ".xls":
                case ".xlsx":
                    Excel.PrintExcelToPdf(sourceFile, outputFilePath);
                    break;

                case ".ppt":
                case ".pptx":
                    PowerPoint.PrintPowerPointToPdf(sourceFile, outputFilePath);
                    break;
            }

            return outputFilePath;
        }

        public static string[] ConvertMsg(string sourceFile)
        {
            Logging.Create("Start converting msg file to pdf.");

            string fileNameWithoutExt = Path.GetFileNameWithoutExtension(sourceFile);
            string mailOutputPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "temp", fileNameWithoutExt + ".pdf");
            List<string> outputFileList = new List<string> { mailOutputPath };

            Dictionary<string, byte[]> allContent = Task.Run(() => Outlook.GetContentFromMsg(sourceFile)).Result;
            int pdfCount = allContent.Keys.Where(file => file.EndsWith(".pdf")).Count();
            Logging.Create(String.Format("Mail document {0} has {1} items.", sourceFile, pdfCount));

            foreach (string fileName in allContent.Keys.WhereNot(key => key.EndsWith(".msg")))
            {
                if (fileName.Equals("email.pdf"))
                {
                    System.IO.File.WriteAllBytes(mailOutputPath, allContent[fileName]);
                    Logging.Create("Mail Content: " + mailOutputPath);
                }
                else
                {
                    string attachmentFile = Path.Combine(Path.GetDirectoryName(mailOutputPath), fileName);
                    System.IO.File.WriteAllBytes(attachmentFile, allContent[fileName]);
                    //Logging.Create(Path.GetExtension(attachmentFile));
                    //if (Path.GetExtension(attachmentFile).Equals(".msg"))
                    //{
                    //    Logging.Create("Redo:" + Path.ChangeExtension(attachmentFile, "pdf"));
                    //    Dictionary<string, byte[]> temp = Task.Run(() => Outlook.GetContentFromMsg(attachmentFile)).Result;
                    //    File.WriteAllBytes(Path.ChangeExtension(attachmentFile, "pdf"), temp["email.pdf"]);
                    //}
                    outputFileList.Add(PdfConverter.Convert(attachmentFile));
                    Logging.Create("Attachment: " + attachmentFile);
                }
            }

            return outputFileList.ToArray();
        }

        private static void PrintImgToPdf(string input, string output, ImageFormat format)
        {
            // Create a new PDF document
            iText.Document pdfDoc = new iText.Document();
            PdfWriter writer = PdfWriter.GetInstance(pdfDoc, new FileStream(output, FileMode.Create));
            pdfDoc.SetMargins(0, 0, 0, 0);
            pdfDoc.Open();

            using (var img = System.Drawing.Image.FromFile(input))
            {
                if (format == ImageFormat.Tiff)
                {
                    var pages = img.GetFrameCount(FrameDimension.Page);
                    for (int i = 0; i < pages; ++i)
                    {
                        img.SelectActiveFrame(FrameDimension.Page, i);
                        iText.Image image = iText.Image.GetInstance(img, ImageFormat.Bmp);

                        // Set page size to fit the image
                        pdfDoc.SetPageSize(new iText.Rectangle(0, 0, image.Width, image.Height));
                        // Start new page to activiate the page size property
                        pdfDoc.NewPage();
                        pdfDoc.Add(iText.Image.GetInstance(image));
                    }
                }
                else
                {
                    // Set page size to fit the image
                    pdfDoc.SetPageSize(new iText.Rectangle(0, 0, img.Width, img.Height));
                    pdfDoc.Add(iText.Image.GetInstance(img, format));
                }
            }

            // Save and close the PDF document
            pdfDoc.Close();
        }
    }
}
