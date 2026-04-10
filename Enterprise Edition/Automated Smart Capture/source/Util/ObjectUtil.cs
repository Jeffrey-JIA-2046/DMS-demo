using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Reflection;
using System.Windows.Forms;
using AutomatedSmartCapture.Model;
using static System.Net.WebRequestMethods;

namespace System
{
    public static class ObjectUtil
    {
        public static dynamic GetProperty(this object obj, string name)
        {
            PropertyInfo[] props = obj.GetType().GetProperties();
            var dict = props.ToDictionary(prop => prop.Name, prop => prop.GetValue(obj));
            return dict[name];
        }

        internal static Dictionary<string, dynamic> ToSingleDict(this Dictionary<string, Dictionary<string, dynamic>> fileDict, string key)
        {
            return fileDict.ToDictionary(file => file.Key, file => file.Value.GetProperty(key));
        }

        internal static List<string> GetScannedFileNameList(this List<MetaDocument> metaDocList, TreeNode parent = null)
        {
            var file = metaDocList.Where(mtdoc => mtdoc.FileName.StartsWith("SCN_") & mtdoc.AssociatedNode.Parent == parent);
            return file.Select(mtdoc => mtdoc.FileName).ToList();
        }

        internal static List<string> GetScannedFileNameList(this List<Document> docList)
        {
            List<string> list = docList.Select(doc => doc.FileName).Where(filename => filename.StartsWith("SCN_")).ToList();
            list.Sort();
            return list;
        }

        internal static int GetNextSeqNumber(this List<string> fileList)
        {
            if (fileList.Count > 0)
            {
                string lastFile = fileList.Last();
                string lastSeqNumStr = Path.GetFileNameWithoutExtension(lastFile).Split('_').Last().Replace("img", "");
                return int.Parse(lastSeqNumStr) + 1;
            }
            else
            {
                return 1;
            }
        }
        
        public static void Add<T1, T2>(this List<Tuple<T1, T2>> tuples, T1 item1, T2 item2)
        {
            var newTuple = new Tuple<T1, T2>(item1, item2);
            tuples.Add(newTuple);
        }
    }
}
