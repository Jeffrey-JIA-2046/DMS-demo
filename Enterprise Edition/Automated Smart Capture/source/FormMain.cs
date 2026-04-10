using Emc.Documentum.FS.DataModel.Core.Query;
using Emc.Documentum.FS.Runtime.Context;
using Emc.Documentum.FS.Services.Core;
using Emc.Documentum.FS.Services.Search;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using AutomatedSmartCapture.ExportTools.Documentum;
using AutomatedSmartCapture.Model;
using AutomatedSmartCapture.Properties;
using AutomatedSmartCapture.Util;
using Newtonsoft.Json.Linq;

namespace AutomatedSmartCapture
{
    public partial class FormMain : Form
    {
        // Major form instances to declare
        private FormLogin _formLogin;
        internal FormPrint _FormPrint;
        internal FormScan _FormScan;

        // Other class variables
        internal User LoggedUser;
        private CmsUtil _cms { get { return Program.Cms; } }
        internal Dictionary<string, dynamic> DfsData { get { return Program.DfsData; } }
        private Settings _appSettings { get { return Program.AppSettings; } }

        public FormMain()
        {
            InitializeComponent();
            
            //this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            this.Text = "Automated Smart Capture";
            this.timer1.Interval = _appSettings.Timeout;

            //string file = "C:\\Users\\jeffreytong\\Documents\\HKJC\\EDP.HR\\Phase1\\samples\\12345678_0201_Setup SSLvpn guide.pdf";
            //string selectedType = "GF200";
            //var metadata = new JObject();
            //metadata.Add("gf200_form_name", "GF200");
            //metadata.Add("gf200_state_post", "Test la");
            //metadata.Add("gf200_department", "X");
            //metadata.Add("gf200_chn_name", "馬一龍");
            //metadata.Add("gf200_eng_name", "E Lon Ma");
            //metadata.Add("gf200_dob", "1964-02-07");
            //metadata.Add("gf200_form_id", "123");
            //var table = _cms.GetTableInfo(_cms.GetAllTypes().Where(type => type["misTypeLabel"].ToString() == selectedType).Select(type => (string)type["misTypeId"]).First());
            //var folder = _cms.GetFolderList().First();
            //_cms.UploadDocument(file, table, metadata, folder);
        }

        private void FormMain_Load(object sender, EventArgs e)
        {
            _formLogin = new FormLogin { _FormMain = this, Text = this.Text, Icon = this.Icon };
            _formLogin.ShowDialog();

            timer1.Start();
        }

        private void FormMain_Shown(object sender, EventArgs e)
        {
            //// Just a list of document categories (by name)
            //DfsData["DocCatList"] = Dfs.PopulateListItems("hr_print_doctype", "name");
            //// List of matched values of document category (by names)
            //DfsData["DocCatCodeDict"] = Dfs.PopulateDictItems("hr_print_doctype", "name", "code");
            //DfsData["TargetFolderDict"] = Dfs.PopulateDictItems("hr_print_doctype", "name", "target_folder");
            //DfsData["SubFolderDict"] = Dfs.PopulateDictItems("hr_print_doctype", "name", "sub_folder");
            //// List of supported file extensions
            //DfsData["FileExtDict"] = Dfs.PopulateDictItems("d2_dictionary_value", "object_name", "locale_value", "dictionary_name='Supported File Extension'");
        }

        private void btnQRCodePrint_Click(object sender, EventArgs e)
        {
            _FormPrint = new FormEmp(this);
            _FormPrint = new FormDocCat(this);
            _FormPrint.ShowDialog();
        }

        private void btnCapture_Click(object sender, EventArgs e)
        {
            _FormScan = new FormScan(this);
            _FormScan.ShowDialog();
        }

        public void FormMain_MouseMove(object sender, MouseEventArgs e)
        {
            timer1.Stop();
            timer1.Start();
        }

        private void timer1_Tick(object sender, EventArgs e)
        {
            Logging.Write("Session expired.");
            MessageBox.Show("Session expired. Please login again.");
            Application.Restart();
        }

        internal void SetMouseMoveEvent(params Control[] ctrls)
        {
            foreach (Control ctrl in ctrls)
            {
                ctrl.MouseMove += new System.Windows.Forms.MouseEventHandler(this.FormMain_MouseMove);
            }
        }

        private void bwTokenValidator_DoWork(object sender, DoWorkEventArgs e)
        {
            timer1.Start();
            //while (_cms.Authenticate()) { }

            //FormMain newSession = new FormMain();
            //FormLogin formLogin = new FormLogin() { _FormMain = this, Text = this.Text, Icon = this.Icon };
            //formLogin.ShowDialog();
            //if (_cms.Authenticate())
            //{
            //    this.Show();
            //}
        }
    }
}
