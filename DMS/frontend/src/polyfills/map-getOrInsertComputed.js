// Polyfill helpers for Map/WeakMap used by pdfjs-dist compiled output.
// Adds `getOrInsertComputed` and `getOrInsert` if missing.
(function attachMapHelpers() {
  if (typeof Map !== 'undefined') {
    if (!Map.prototype.getOrInsertComputed) {
      Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
        value: function (key, factory) {
          if (this.has(key)) return this.get(key);
          const v = factory(key);
          this.set(key, v);
          return v;
        },
        configurable: true,
        writable: true,
      });
    }
    if (!Map.prototype.getOrInsert) {
      Object.defineProperty(Map.prototype, 'getOrInsert', {
        value: function (key, value) {
          if (this.has(key)) return this.get(key);
          this.set(key, value);
          return value;
        },
        configurable: true,
        writable: true,
      });
    }
  }

  if (typeof WeakMap !== 'undefined') {
    if (!WeakMap.prototype.getOrInsertComputed) {
      Object.defineProperty(WeakMap.prototype, 'getOrInsertComputed', {
        value: function (key, factory) {
          if (this.has(key)) return this.get(key);
          const v = factory(key);
          this.set(key, v);
          return v;
        },
        configurable: true,
        writable: true,
      });
    }
    if (!WeakMap.prototype.getOrInsert) {
      Object.defineProperty(WeakMap.prototype, 'getOrInsert', {
        value: function (key, value) {
          if (this.has(key)) return this.get(key);
          this.set(key, value);
          return value;
        },
        configurable: true,
        writable: true,
      });
    }
  }
})();
