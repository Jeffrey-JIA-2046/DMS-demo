using AutomatedSmartCapture.Controls;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Reflection;
using System.Collections;

namespace AutomatedSmartCapture.Model
{
    public class MetaDocumentList : DocumentInfo, IList<DocumentInfo>
    {
        public DocumentInfo this[int index] { get => throw new NotImplementedException(); set => throw new NotImplementedException(); }

        public int Count => throw new NotImplementedException();

        public bool IsReadOnly => throw new NotImplementedException();

        public void Add(DocumentInfo item)
        {
           throw new NotImplementedException();
        }

        public void Clear()
        {
            throw new NotImplementedException();
        }

        public bool Contains(DocumentInfo item)
        {
            throw new NotImplementedException();
        }

        public void CopyTo(DocumentInfo[] array, int arrayIndex)
        {
            throw new NotImplementedException();
        }

        public IEnumerator<DocumentInfo> GetEnumerator()
        {
            throw new NotImplementedException();
        }

        public int IndexOf(DocumentInfo item)
        {
            throw new NotImplementedException();
        }

        public void Insert(int index, DocumentInfo item)
        {
            throw new NotImplementedException();
        }

        public bool Remove(DocumentInfo item)
        {
            throw new NotImplementedException();
        }

        public void RemoveAt(int index)
        {
            throw new NotImplementedException();
        }

        IEnumerator IEnumerable.GetEnumerator()
        {
            throw new NotImplementedException();
        }
    }

    public class MetaDocument : DocumentInfo
    {
        public string Value { get { return this.AssociatedNode.Text; } }
        public int Level { get { return this.AssociatedNode.Level; } }
        public IList<DocumentInfo> Children { get; private set; }
        public MetaDocumentList metaDocList { get; private set; }
        public MetaDocument(TreeNode node, bool isScanned)
        {
            AssociatedNode = node;
            if (metaDocList==null)
            {
                Key = node.FullPath;
            }
            else
            {
                Key = node.FullPath + (metaDocList.Count == 0 ? "" : String.Format(" ({0})", metaDocList.Count));
            }

            FileName = String.Format("{0}_{1}.tif", isScanned ? "SCN" : "IMP", Key);
            Children = new List<DocumentInfo>();

            AssociatedNode.Name = "B" + node.Level; // Represent a level of branch in order to help searching
            //AssociatedNode.Tag = new MetaDocumentList() { this };

        }

        public MetaDocument(MetaDocumentList existingTag)
        {
            if (existingTag == null) { return; }
            AssociatedNode = existingTag.AssociatedNode;
            Key = existingTag.Key;
            FileName = existingTag.FileName;
            Children = new List<DocumentInfo>();

            existingTag.Add(this);
            this.metaDocList = existingTag;
        }

        //public MetaDocument(string value, TreeNodeCollection nodes, bool isScanned)
        //{
        //    FileName = String.Format("{0}_{1}_{2}.tif", isScanned ? "SCN" : "IMP", parentNode.FullPath, value);
        //}
    }
}
