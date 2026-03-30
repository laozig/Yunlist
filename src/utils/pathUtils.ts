import path from 'path';
import { config } from '../config';

/**
 * 规格化相对路径：
 * 1. 统一使用正斜杠 (POSIX 风格)
 * 2. 去除首尾的多余斜杠
 * 3. 避免任何 '.' 或 '..' 等路径序列
 */
export const normalizeRelativePath = (relativePath: string): string => {
  if (!relativePath || relativePath === '/' || relativePath === '.') return '';
  
  // 1. 替换反斜杠为正斜杠，并去除首尾斜杠
  let clean = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  
  // 2. 使用 path.posix.normalize 处理多余的斜杠
  clean = path.posix.normalize(clean);
  
  // 3. 再次确保没有前导斜杠 (针对以 / 开头的情况)
  return clean === '.' ? '' : clean.replace(/^\/+/, '');
};

/**
 * 校验路径安全性，防止目录穿越 (Path Traversal) 攻击
 * 确保最终的绝对路径一定在配置的 FILES_ROOT 目录下
 */
export const getSecureFilePath = (relativePath: string): string => {
  // 1. 预处理路径：规格化
  const cleanRelativePath = normalizeRelativePath(relativePath);
  
  // 2. 将传入的路径基于配置的网盘根目录进行解析
  const absoluteTarget = path.resolve(config.filesRoot, cleanRelativePath);
  
  // 3. 严格校验：确保合并后的绝对路径是以根目录开头的
  const rootDirWithSep = path.normalize(config.filesRoot) + path.sep;
  
  if (absoluteTarget !== path.normalize(config.filesRoot) && !absoluteTarget.startsWith(rootDirWithSep)) {
    throw new Error('Access Denied: 路径穿越非法请求');
  }
  
  return absoluteTarget;
};
