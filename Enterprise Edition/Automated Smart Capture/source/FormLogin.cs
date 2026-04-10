using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.DirectoryServices;
using System.DirectoryServices.AccountManagement;
using System.IO;
using System.Configuration;
using Emc.Documentum.FS.DataModel.Core.Query;
using Emc.Documentum.FS.Runtime.Context;
using Emc.Documentum.FS.Services.Core;
using Emc.Documentum.FS.Services.Search;
using AutomatedSmartCapture.Model;
using AutomatedSmartCapture.Properties;
using AutomatedSmartCapture.Util;
using static System.Windows.Forms.VisualStyles.VisualStyleElement.StartPanel;

namespace AutomatedSmartCapture
{
    public partial class FormLogin : Form
    {
        internal FormMain _FormMain;

        internal bool _IsSingleSignOn { get; set; }
        private CmsUtil _cms { get { return Program.Cms; } }
        private Settings _appSettings { get { return Program.AppSettings; } }

        public FormLogin()
        {
            InitializeComponent();
        }

        private void FormLogin_Load(object sender, EventArgs e)
        {
            //_FormMain = (FormMain)OwnedForms[0];
        }

        private void btnLogin_Click(object sender, EventArgs e)
        {
            string userName = this.txtUserName.Text.Trim();
            string password = this.txtPassword.Text.Trim();

            if (_appSettings.SingleLoginMode)
            {
                try
                {
                    if (_cms.Authenticate(userName, password))
                    {
                        this.Hide();
                        _FormMain.Show();
                        Logging.Write("Logged as " + userName);
                    }
                }
                catch (Exception ex)
                {
                    Program.HandleGenericException(ex, "Server authentication failed.");
                }
            }
            else
            {
                try
                {
                    // Get configuration directly from app.config
                    String host = _appSettings.LdapURI;
                    String searchBase = _appSettings.SearchBase;
                    String searchFilter = _appSettings.SearchGroupFilter;

                    // Get result of basic search with search base and group filter
                    DirectoryEntry root = new DirectoryEntry(String.Format("{0}/{1}", host, searchBase), userName, password);
                    DirectorySearcher searcher = new DirectorySearcher(root);
                    searcher.Filter = searchFilter;
                    SearchResultCollection results = searcher.FindAll();

                    foreach (SearchResult result in results)
                    {
                        // Filter the result by search user filter
                        root.Path = result.Path;
                        searcher = new DirectorySearcher(root);
                        searcher.Filter = String.Format("(&({0})(sAMAccountName={1}))", _appSettings.SearchUserFilter, userName);
                        SearchResult filterResult = searcher.FindOne();

                        if (filterResult != null)
                        {
                            _FormMain.LoggedUser = new User(filterResult.Properties["name"][0].ToString());
                            Dictionary<string, string> UserGroups = _FormMain.LoggedUser.Groups;

                            // Retrieve the valid user group(s) which the user is a member of
                            foreach (string group in _appSettings.UserGroups)
                            {
                                string key = group.Split(':')[0];
                                string dn = group.Split(':')[1];

                                searcher.Filter = String.Format("(&(memberOf={0})(sAMAccountName={1}))", dn, userName);
                                if (searcher.FindOne() != null)
                                {
                                    UserGroups.Add(key, dn);
                                }
                            }

                            // Only users of specific groups are allowed to enter the system
                            if (UserGroups.Count > 0)
                            {
                                _FormMain.Show();
                                //this.DialogResult = DialogResult.OK;
                                this.Hide();
                                break;
                            }
                        }
                    }

                    if (this.Visible == true)
                    {
                        Exception ex = new Exception(String.Format("Access by user {0} has been denied.", userName));
                        Program.HandleGenericException(ex, "Authentication failed.");
                    }
                    else
                    {
                        Logging.Write("Logged as " + userName);
                    }
                }
                catch (Exception ex)
                {
                    Program.HandleGenericException(ex, "Authentication failed.");
                }
            }
        }

        private void FormLogin_FormClosing(object sender, FormClosingEventArgs e)
        {
            
        }

        private void FormLogin_FormClosed(object sender, FormClosedEventArgs e)
        {
            // When the form has been clicked to close
            _FormMain.Close();
        }

        private void txtBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                btnLogin.PerformClick();
            }
        }
    }
}
