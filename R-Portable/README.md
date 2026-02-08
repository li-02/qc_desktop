# R Portable 环境准备指南

本目录用于存放便携式R环境，打包时会自动嵌入到应用安装包中。

## 准备步骤

### 1. 下载R Portable

**方式A：使用R Portable项目（推荐）**
- 下载地址: https://sourceforge.net/projects/rportable/
- 选择 R-Portable 4.x.x 版本

**方式B：手动制作便携版**
1. 从官网下载R安装程序: https://cran.r-project.org/bin/windows/base/
2. 安装到临时目录
3. 复制整个安装目录到此处

### 2. 目录结构

确保目录结构如下：
```
R-Portable/
├── bin/
│   ├── x64/
│   │   ├── R.dll
│   │   ├── Rscript.exe
│   │   └── ...
│   └── ...
├── library/
│   ├── base/
│   ├── REddyProc/    # 需要预装
│   └── ...
├── etc/
└── ...
```

### 3. 预装REddyProc包

在R中运行以下命令安装REddyProc及其依赖：

```r
# 设置CRAN镜像
options(repos = c(CRAN = "https://cloud.r-project.org"))

# 安装REddyProc及依赖
install.packages("REddyProc", dependencies = TRUE)

# 验证安装
library(REddyProc)
packageVersion("REddyProc")
```

或者使用命令行：
```bash
Rscript -e "install.packages('REddyProc', repos='https://cloud.r-project.org', dependencies=TRUE)"
```

### 4. 验证安装

运行以下命令验证R环境：
```bash
# 检查R版本
R-Portable/bin/x64/Rscript.exe --version

# 检查REddyProc
R-Portable/bin/x64/Rscript.exe -e "library(REddyProc); cat('REddyProc OK\n')"
```

## 打包说明

`electron-builder.json` 已配置自动将此目录打包到应用的 `resources/R` 目录。

打包命令：
```bash
npm run build
npx electron-builder --win
```

## 大小优化（可选）

如需减小R环境体积，可以删除以下不必要的文件：
- `doc/` 目录（文档）
- `tests/` 目录（测试文件）
- `Tcl/` 目录（如不需要Tcl/Tk）
- 不需要的包（保留base、REddyProc及其依赖）

优化后可将体积从~300MB减小到~150MB。

## 注意事项

1. **R版本**: 建议使用 R 4.0.0 或更高版本
2. **架构**: 仅需保留 x64 版本（现代Windows都是64位）
3. **依赖包**: REddyProc依赖较多包，确保完整安装
4. **测试**: 打包前务必测试REddyProc功能正常
