using AutomatedSmartCapture.Controls;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AutomatedSmartCapture.Model
{
    public class Document : DocumentInfo
    {
        public string Name
        {
            get
            {
                return this.AssociatedNode.Text;
            }
        }

        //public bool IsScanned { get; set; }
        public string PdfFileName { get; set; }
        public Document(TreeNode node,bool isScanned)
        {
            Key = node.FullPath;
            FileName = String.Format("{0}_{1}{2}", isScanned ? "SCN" : "IMP", Key, isScanned ? ".tif" : "");
            
            AssociatedNode = node;
            AssociatedNode.Name = Key;
            AssociatedNode.Tag = this;
        }
    }
}