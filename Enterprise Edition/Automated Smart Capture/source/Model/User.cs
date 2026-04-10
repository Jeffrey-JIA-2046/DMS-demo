using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutomatedSmartCapture.Model
{
    internal class User
    {
        public string Name { get; set; }
        public Dictionary<string, string> Groups { get; set; }

        internal User(string name)
        {
            Name = name;
            Groups = new Dictionary<string, string>();
        }
    }
}
