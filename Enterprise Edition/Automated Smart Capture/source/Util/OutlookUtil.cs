using System.Net.NetworkInformation;
using Microsoft.Office.Interop.Outlook;
using Wd = Microsoft.Office.Interop.Word;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using AutomatedSmartCapture.Model;
using System.Net.Http;
using System.Security.Policy;
using Newtonsoft.Json.Linq;
using System.Net;
using System.IO;

namespace AutomatedSmartCapture.Util
{
    internal static class Outlook
    {
        private static Application _app;
        private static MailItem _mail;

        private static Wd.Application _wdApp;
        private static Wd.Document _wdDoc;

        public static int GetPageCount(string file)
        {
            Open(file);
            int output = _wdDoc.ComputeStatistics(Wd.WdStatistic.wdStatisticPages); ;
            Close();

            return output;
        }

        public static void Open(string file)
        {
            _app = new Application();
            _mail = _app.Session.OpenSharedItem(file);

            _wdApp = new Wd.Application()
            {
                DisplayAlerts = Wd.WdAlertLevel.wdAlertsNone,
                Visible = false
            };
            _wdDoc = _wdApp.Documents.Add();
            var range = _wdDoc.Range();
            range.InsertAfter(_mail.Body);
        }

        public static void Close()
        {
            _wdDoc.Close(false);
            _wdApp.Quit(false);

            _mail.Close(OlInspectorClose.olDiscard);
            if (_mail != null)
                while(Marshal.ReleaseComObject(_mail) > 0);
            
            _app.Quit();
        }

        public static async Task<Dictionary<string, byte[]>> GetContentFromMsg(string input)
        {
            Dictionary<string, byte[]> output = new Dictionary<string, byte[]>();

            var client = new HttpClient();
            Byte[] bytes = System.IO.File.ReadAllBytes(input);
            string base64file = Convert.ToBase64String(bytes);
            string json = "{\"image\":\"" + base64file + "\",\"contentType\":\"msg\",\"responseFormat\":\"pdf\"}";
            
            HttpRequestMessage request = new HttpRequestMessage
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
                Method = HttpMethod.Post,
                //RequestUri = new Uri(Program.AppSettings.ConvertMsgApi),
            };

            using (var response = (HttpResponseMessage)await client.SendAsync(request))
            {
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    JObject jsonform = JObject.Parse(response.Content.ReadAsStringAsync().Result);
                    //.Create(new Log(jsonform.ToString()));
                    var array = jsonform.GetValue("data").ToObject<JArray>();

                    foreach (JObject item in array)
                    {
                        string content = (string)item["base64Content"];
                        string fileName = (string)item["fileName"];
                        int pid = (int)item["pid"];
                        Logging.Create("Mail item: " + fileName);

                        byte[] decodedContent = Convert.FromBase64String(content);
                        if (fileName == "email.pdf")
                        {
                            output.Add(String.Format("email{0}.pdf", pid == 0 ? "" : "_" + pid), decodedContent);
                        }
                        else
                        {
                            output.Add(String.Format("att{0}_", array.IndexOf(item)) + fileName, decodedContent);
                        }
                    }
                }
                else
                {
                    Logging.Create(String.Format("API Error {0}: {1}", response.StatusCode.ToString(), response.Content.ReadAsStringAsync().Result));
                    System.Windows.Forms.MessageBox.Show("Failed to convert msg file to pdf.");
                }
            }

            return output;
        }

    }
}
