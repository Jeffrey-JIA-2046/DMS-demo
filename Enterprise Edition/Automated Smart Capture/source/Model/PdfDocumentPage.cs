using AutomatedSmartCapture.Controls;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AutomatedSmartCapture.Model
{
    public abstract class DocumentPageInfo : DocumentInfo
    {
        public int PageNo { get; protected set; }
    }

    public class ScannedDocumentPage : DocumentPageInfo
    {

        public ScannedDocumentPage(TreeNode node, int pageNo)
        {
            PageNo = pageNo;
            Key = node.FullPath;
            FileName = String.Format("SCN_{0}.tif", node.Parent.FullPath);

            AssociatedNode = node;
            AssociatedNode.Name = Key;
            AssociatedNode.Tag = this;
        }
    }

    public class PdfDocumentPage : DocumentPageInfo
    {

        public PdfDocumentPage(TreeNode node, int pageNo)
        {
            PageNo = pageNo;
            Key = node.FullPath;
            FileName = String.Format("IMP_{0}.tif", node.FullPath);

            AssociatedNode = node;
            AssociatedNode.Name = Key;
            AssociatedNode.Tag = this;
        }
    }
}
