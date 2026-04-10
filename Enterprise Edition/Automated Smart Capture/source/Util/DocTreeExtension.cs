using AutomatedSmartCapture.Controls;
using AutomatedSmartCapture.Model;
using Org.BouncyCastle.Asn1.Ocsp;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace System.Windows.Forms
{
    internal static class DocTreeExtension
    {
        public static TreeNode AppendNode(this TreeView tv, string displayText)
        {
            return tv.Nodes.Add("0", displayText);
        }

        //public static TreeNode AppendNode(this TreeNode parentNode, string displayText)
        //{
        //    int childLevel = parentNode.Level + 1;
        //    return parentNode.Nodes.Add(childLevel.ToString(), displayText);
        //}

        //public static TreeNode AppendNode(this TreeNode parentNode, string key, string displayText)
        //{
        //    return parentNode.Nodes.Add(key, displayText);
        //}

        public static TreeNode GetNode(this TreeView tv, string displayText)
        {
            return tv.Nodes.Cast<TreeNode>().Where(node => node.Text == displayText).FirstOrDefault();
        }

        public static TreeNode GetNode(this TreeNode parentNode, string displayText)
        {
            return parentNode.Nodes.Cast<TreeNode>().Where(node => node.Text == displayText).FirstOrDefault();
        }

        public static List<TreeNode> GetNodeList(this TreeView tv, Func<TreeNode, bool> filter = null)
        {
            return tv.Nodes.Cast<TreeNode>().Where(filter ?? (node => true)).ToList();
        }

        public static List<TreeNode> GetNodeList(this TreeNode parentNode, Func<TreeNode, bool> filter = null)
        {
            return parentNode.Nodes.Cast<TreeNode>().Where(filter ?? (node => true)).ToList();
        }

        //public static List<TreeNode> GetFullNodeList(this TreeView tv)
        //{
        //    List<TreeNode> list = new List<TreeNode>();

        //    foreach (TreeNode topNode in tv.Nodes)
        //    {
        //        list.Add(topNode);
        //        list.AddRange(GetDescendentList(topNode));
        //    }

        //    return list;
        //}

        //public static List<TreeNode> GetDescendentList(this TreeNode rootNode)
        //{
        //    List<TreeNode> list = new List<TreeNode>();

        //    foreach (TreeNode child in rootNode.Nodes)
        //    {
        //        list.Add(child);
        //        list.AddRange(GetDescendentList(child));
        //    }

        //    return list;
        //}

        public static DocumentInfo GetInfo(this TreeNode node)
        {
            return (DocumentInfo)node.Tag;
        }
    }
}
