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
using static System.Windows.Forms.VisualStyles.VisualStyleElement.StartPanel;
//using PresentationControls;
using System.Text.RegularExpressions;

namespace AutomatedSmartCapture
{
    public partial class FormEdit : Form
    {
        internal new FormScan Parent { get; set; }
        //internal CmsUtil CmsUtil { get; set; }
        internal TreeNode Target { get; }

        public FormEdit(TreeNode thisNode)
        {
            InitializeComponent();
            Target = thisNode;
        }

        private void FormEdit_Load(object sender, EventArgs e)
        {
            // For any defined node
            if (Target.Parent.Text != "Undefined")
            {
                txtEmpID.Text = Target.FullPath.Split('\\')[0];
            }

            //if (Parent.Main.DfsData["DocCatList"].Contains(Target.Text))
            //{
            //    // Disable the drop down selection if the target node is a document category node
            //    cbDocCat.Text = Target.Text;
            //    cbDocCat.Enabled = false;
            //}
            //else
            //{
            //    // Fill the document category list
            //    cbDocCat.Items.AddRange(Parent.Main.DfsData["DocCatList"].ToArray());
            //    cbDocCat.Sorted = true;

            //    // For defined document node
            //    if (Target.Parent.Text != "Undefined")
            //    {
            //        cbDocCat.Text = Target.Parent.Text;
            //    }
            //}
        }

        private void btnOK_Click(object sender, EventArgs e)
        {
            string empID = txtEmpID.Text;
            //string docCat = cbDocCat.Text;

            if (String.IsNullOrEmpty(empID))
            {
                MessageBox.Show("Please enter the Employee ID!");
            }
            //else if (String.IsNullOrEmpty(docCat))
            //{
            //    MessageBox.Show("Please choose the Document Type!");
            //}
            else if (!new Regex(@"^[0-9]{8}$").IsMatch(empID) & empID.Length > 0)
            {
                MessageBox.Show("Invalid Employee ID!");
            }
            else
            {
                //Parent.FormEdit_Submit(empID, docCat, Target);
                this.Close();
            }
        }

        private void btnCancel_Click(object sender, EventArgs e)
        {
            this.Close();
        }
    }
}
