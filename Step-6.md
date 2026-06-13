# Step 6 - 实现文档解析、OCR、预览文本与切片

## 目标

把已上传的文件和网页来源真正解析成系统可检索的数据，包括：抽取文本、预览文本、摘要占位、位置标签、切片记录和失败状态。

## 输入

- `design6.13v2130.md`
- 已实现的文件上传与网页导入
- 支持解析类型：
  - PDF
  - DOCX
  - PPTX
  - XLSX
  - CSV
  - PNG/JPG/JPEG OCR
  - HTML 文本

## 需要实现

1. 建立解析器分发层：
   - 按 `file_type` 路由到对应解析器
   - 解析失败时写入 `parse_error`

2. 解析结果至少包含：
   - 主体文本
   - 文档预览文本 `preview_text`
   - 位置标签 `location_label`
   - 结构信息：页码、表格页、工作表名等可选字段

3. 图片 OCR：
   - 仅支持 `png/jpg/jpeg`
   - 将 OCR 文本作为普通文档文本处理

4. 切片逻辑：
   - 统一 chunk 策略
   - 为每个 chunk 写入 `document_chunks`
   - 写入 `chunk_index`、`location_label`、`start_offset`、`end_offset`

5. 状态流转：
   - `pending -> processing -> done`
   - 失败则 `failed`

6. 文档重试与重建：
   - `POST /documents/{id}/index`
   - `POST /documents/{id}/retry-parse`

## 输出

- 多格式解析器
- 图片 OCR 处理逻辑
- `preview_text`
- `document_chunks`
- 重试与重新解析接口

## 校验

1. PDF、DOCX、PPTX、XLSX、CSV、图片、HTML 至少各有一类样例能落到 `done`。
2. 解析完成后 `documents.preview_text` 不为空。
3. `document_chunks` 中存在对应切片。
4. 失败文档可通过重试接口重新处理。
5. 中文内容在预览和切片中不乱码。

## 不要做

- 不接入向量库
- 不实现问答
- 不实现 DOCX 导出

## 完成判定

当系统已经能把支持的来源稳定解析成 chunk 数据，并且失败状态可见、可重试时，本步骤完成。
