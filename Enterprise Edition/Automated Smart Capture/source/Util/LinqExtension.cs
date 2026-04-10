using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace System.Linq
{
    public static partial class Enumerable
    {
        public static IEnumerable<TSource> WhereNot<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
        {
            return source.Where(item => !predicate(item));
        }

        public static IEnumerable<TSource> RemoveAt<TSource>(this IEnumerable<TSource> source, int position)
        {
            var first = source.Take(position);
            var second = source.Skip(position + 1);
            return first.Concat(second);
        }

        public static IEnumerable<TSource> InsertAt<TSource>(this IEnumerable<TSource> source, TSource element, int position)
        {
            var first = source.Take(position);
            var second = source.Skip(position);
            return first.Append(element).Concat(second);

        }
    }
}
