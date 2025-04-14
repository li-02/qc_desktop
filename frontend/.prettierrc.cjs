module.exports = {
  tabWidth: 2, // 使用2个空格缩进
  semi: true, // 代码结尾是否加分号
  singleQuote: false, // 是否使用单引号
  printWidth: 100, // 超过多少字符强制换行
  bracketSpacing: true, // 对象大括号内两边是否加空格 { a:0 }
  endOfLine: 'auto', // 文件换行格式 LF/CRLF
  useTabs: false, // 不使用缩进符,而使用空格
  quoteProps: 'as-needed', // 对象的key仅在必要时用引号
  rangeStart: 0, // 每个文件格式化的范围是文件的全部内容
  rangeEnd: Infinity, // 结尾
  proseWrap: 'preserve', // 使用默认的折行标准
  htmlWhitespaceSensitivity: 'css', // 根据显示样式决定html要不要折行
}
