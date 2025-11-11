// This utility converts object keys between camelCase and snake_case recursively.

const toCamel = (s: string): string => {
  return s.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
};

const toSnake = (s: string): string => {
  return s.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

const isObject = (o: any): o is Record<string, any> => {
  return o === Object(o) && !Array.isArray(o) && typeof o !== 'function';
};

const convertKeys = (o: any, converter: (s: string) => string): any => {
  if (isObject(o)) {
    const n: { [key: string]: any } = {};
    Object.keys(o).forEach((k) => {
      n[converter(k)] = convertKeys(o[k], converter);
    });
    return n;
  } else if (Array.isArray(o)) {
    return o.map((i) => {
      return convertKeys(i, converter);
    });
  }
  return o;
};

export const deepConvertToCamelCase = <T>(obj: any): T => {
    return convertKeys(obj, toCamel) as T;
};

export const deepConvertToSnakeCase = (obj: any): any => {
    return convertKeys(obj, toSnake);
};
