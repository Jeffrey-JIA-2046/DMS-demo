using AutomatedSmartCapture.Controls;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AutomatedSmartCapture.Model
{
    public abstract class DocumentInfo
    {
        public TreeNode AssociatedNode { get; set; }
        public string Key { get; protected set; }
        public string FileName { get; protected set; }
        public bool IsScanned { get { return FileName.StartsWith("SCN_"); } }
        public bool IsPdf { get { return FileName.ToLowerInvariant().EndsWith(".pdf"); } }
        public bool InProcessingBatch { get; set; }
    }
}
