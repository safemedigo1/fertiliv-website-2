# دليل استيراد نسخة Fertiliv إلى MySQL 8.4 على Windows

## ملخص مهم قبل البدء

هذه الحزمة هي **نسخة COPY من قاعدة الإنتاج** وليست عملية نقل أو cutover. يجب تنفيذ الخطوات على قاعدة MySQL 8.4 مستقلة وفارغة على Windows.

- لا تستخدم `schema-raw-tidb.sql` للاستيراد المباشر.
- استخدم `schema-mysql84-candidate.sql` للمخطط المرشح لـ MySQL 8.4.
- استورد `data.sql` بعد نجاح استيراد المخطط.
- لا تعِد بناء قاعدة البيانات من Drizzle migrations؛ فالمخطط الفعلي في الحزمة مستخرج من production عبر `SHOW CREATE TABLE` و`information_schema`.
- لا تستخدم `--force` لإخفاء أخطاء الاستيراد.
- لا تضع كلمة المرور داخل الأمر أو ملف batch مكشوف.
- هذه الحزمة لا تنقل WhatsApp sessions أو provider credentials أو runtime state. بعد الاستيراد ستحتاج تكوينها منفصلاً إن كان ذلك مطلوباً.

## الملفات المطلوبة

بعد فك ضغط الملف يجب أن تكون الملفات التالية في مجلد واحد، مثل:

```text
C:\FertilivExport\production-db-20260930T194611Z\
  schema-mysql84-candidate.sql
  schema-raw-tidb.sql
  data.sql
  schema-manifest.json
  table-row-counts.csv
  indexes-constraints.csv
  mysql84-compatibility-report.md
  excluded-whatsapp-runtime-data.csv
  IMPORT-README.md
  EXPORT-HANDOVER.md
  SHA256SUMS.txt
```

الحزمة الأصلية:

```text
Fertiliv-production-db-copy-2026-09-30T194611Z.zip
```

## 1. تجهيز Windows وMySQL

### 1.1 تثبيت MySQL Server 8.4

ثبّت MySQL Community Server **8.4.x**، وتأكد من تثبيت MySQL Client Tools أيضاً، لأن `mysql.exe` و`mysqlcheck.exe` مطلوبان.

تحقق من خدمة MySQL باستخدام PowerShell:

```powershell
Get-Service | Where-Object { $_.Name -like "MySQL*" } |
  Format-Table Name, Status, DisplayName
```

إذا كانت الخدمة متوقفة، شغّل اسم الخدمة الفعلي الذي ظهر في النتيجة:

```powershell
Start-Service -Name "MySQL84"
```

> لا تفترض أن اسم الخدمة هو `MySQL84`. استخدم الاسم الذي يعرضه Windows فعلياً.

تحقق من موقع العميل:

```powershell
$mysql = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"
& $mysql --version
```

يجب أن تظهر نسخة 8.4.x. إذا لم يكن المسار صحيحاً، ابحث عن `mysql.exe` و`mysqlcheck.exe` داخل مجلد MySQL المثبت.

### 1.2 إنشاء مجلد العمل

يفضل استخدام مسار قصير بلا مسافات:

```powershell
New-Item -ItemType Directory -Force C:\FertilivExport | Out-Null
```

ضع ملف ZIP داخله ثم فك الضغط:

```powershell
Expand-Archive `
  -Path C:\FertilivExport\Fertiliv-production-db-copy-2026-09-30T194611Z.zip `
  -DestinationPath C:\FertilivExport\unpacked `
  -Force
```

المسار المتوقع:

```text
C:\FertilivExport\unpacked\production-db-20260930T194611Z\
```

## 2. التحقق من سلامة الحزمة

### 2.1 التحقق من ZIP

إذا تم تزويد المطور بملف checksum الخارجي:

```powershell
Get-FileHash `
  C:\FertilivExport\Fertiliv-production-db-copy-2026-09-30T194611Z.zip `
  -Algorithm SHA256
```

القيمة المتوقعة هي:

```text
d9d372c59503aa20c83b4de7934986ca3bce557ab00e7f48e2b387f4bb9e7356
```

إذا اختلفت القيمة، **توقف** وأعد تنزيل الملف. لا تحاول إصلاحه أو الاستيراد منه.

### 2.2 التحقق من ملفات الحزمة الداخلية

افتح PowerShell داخل مجلد الحزمة:

```powershell
$work = "C:\FertilivExport\unpacked\production-db-20260930T194611Z"
Set-Location $work
```

في PowerShell 7 يمكن التحقق من كل الملفات عبر:

```powershell
Get-Content .\SHA256SUMS.txt | ForEach-Object {
  $parts = $_ -split "  ", 2
  $expected = $parts[0]
  $file = $parts[1]
  $actual = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected.ToLower()) {
    throw "Checksum mismatch: $file"
  }
  Write-Host "OK $file"
}
```

يجب ألا يظهر أي `Checksum mismatch`.

### 2.3 عدم إعادة حفظ ملفات SQL

لا تفتح ملفات SQL في Notepad أو Excel ثم تحفظها؛ فقد يتغير encoding أو علامات الاقتباس أو line endings. استخدم الملفات كما هي، مع خيار:

```text
--default-character-set=utf8mb4
```

## 3. إنشاء قاعدة هدف فارغة

استخدم حساب MySQL إداري مخصص للاستيراد. لا تضع كلمة المرور داخل الأمر؛ استخدم `-p` ليطلبها MySQL تفاعلياً.

من PowerShell:

```powershell
$mysql = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"
& $mysql -u root -p -e `
  "CREATE DATABASE IF NOT EXISTS fertiliv_copy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

تحقق من الإصدار والترميز والحجم المسموح:

```powershell
& $mysql -u root -p --batch --raw -e `
  "SELECT VERSION() AS mysql_version, @@character_set_server AS server_charset, @@collation_server AS server_collation, @@max_allowed_packet AS max_packet;"
```

المطلوب:

- الإصدار: MySQL 8.4.x.
- الترميز المفضل: `utf8mb4`.
- لا تستخدم قاعدة production الحالية بالخطأ.
- إذا كانت قاعدة `fertiliv_copy` تحتوي جداول من محاولة سابقة، لا تعاود الاستيراد فوقها؛ احذف **قاعدة الهدف فقط** وأعد إنشاءها.

لحذف قاعدة الهدف فقط عند الحاجة:

```powershell
& $mysql -u root -p -e "DROP DATABASE IF EXISTS fertiliv_copy; CREATE DATABASE fertiliv_copy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

> لا تنفذ أمر `DROP DATABASE` إلا بعد التأكد مرتين أن الاسم هو قاعدة Windows الهدف، وليس قاعدة production.

## 4. فحص صلاحيات حساب الاستيراد

حساب الاستيراد يحتاج صلاحيات إنشاء الجداول والفهارس والقيود. أسهل خيار هو حساب إداري أثناء الاستيراد فقط.

تحقق:

```powershell
& $mysql -u root -p -e "SHOW GRANTS;"
```

إذا استخدم المطور حساباً غير `root`، فيجب أن يملك على الأقل صلاحيات مناسبة على قاعدة الهدف مثل `CREATE`, `ALTER`, `INDEX`, `REFERENCES`, `INSERT`, `SELECT`، إضافة إلى صلاحيات schema اللازمة. لا تستخدم حساب التطبيق محدود الصلاحيات لاستيراد schema.

## 5. استيراد schema-mysql84-candidate.sql

### الطريقة الموصى بها: Command Prompt

افتح **Command Prompt**، وليس محرر نصوص، ونفذ الأمر التالي بعد تعديل المسارات فقط:

```cmd
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" --default-character-set=utf8mb4 --binary-mode=1 --max-allowed-packet=256M -u root -p fertiliv_copy < "C:\FertilivExport\unpacked\production-db-20260930T194611Z\schema-mysql84-candidate.sql" > "C:\FertilivExport\schema-import.stdout.log" 2> "C:\FertilivExport\schema-import.stderr.log"
```

سيطلب الأمر كلمة المرور تفاعلياً.

إذا عاد رمز الخروج إلى Command Prompt:

```cmd
echo %ERRORLEVEL%
```

النتيجة `0` تعني نجاح الأمر. يجب أيضاً فحص ملف الخطأ:

```cmd
type C:\FertilivExport\schema-import.stderr.log
```

### ما الذي يتوقعه المطور في هذا الملف؟

بداية الملف تحتوي فعلياً على:

```sql
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
```

والملف ينتهي بإعادة تفعيل فحص القيود. لا تضف `CREATE DATABASE` أو `USE` إلى الملف؛ اسم قاعدة الهدف موجود في أمر `mysql` نفسه.

`schema-mysql84-candidate.sql` هو الملف المرشح. لا تستبدله بـ`schema-raw-tidb.sql`، لأن الملف الخام يحتفظ بتعليقات TiDB الخاصة بـclustered indexes.

## 6. التحقق بعد استيراد schema وقبل data.sql

نفذ:

```powershell
& $mysql -u root -p --batch --raw -e `
  "SELECT COUNT(*) AS base_tables FROM information_schema.tables WHERE table_schema='fertiliv_copy' AND table_type='BASE TABLE'; SELECT COUNT(*) AS views FROM information_schema.views WHERE table_schema='fertiliv_copy'; SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.schemata WHERE schema_name='fertiliv_copy';"
```

النتيجة المتوقعة:

- `base_tables = 137`
- `views = 0`
- character set = `utf8mb4`
- collation الافتراضية = `utf8mb4_unicode_ci`

تحقق من وجود الجداول المهمة:

```powershell
& $mysql -u root -p fertiliv_copy -e `
  "SHOW TABLES LIKE 'patients'; SHOW TABLES LIKE 'medical_intake'; SHOW TABLES LIKE 'treatment_plans'; SHOW TABLES LIKE 'audit_logs'; SHOW TABLES LIKE 'whatsapp_conversations'; SHOW TABLES LIKE 'whatsapp_linked_device_sessions';"
```

تحقق من فهارس وقيود عينة:

```powershell
& $mysql -u root -p fertiliv_copy -e "SHOW CREATE TABLE patients\G; SHOW CREATE TABLE medical_intake\G; SHOW CREATE TABLE whatsapp_linked_device_messages\G;"
```

في هذه المرحلة يجب أن تكون الجداول فارغة؛ وجود بيانات قبل استيراد `data.sql` يعني أن قاعدة الهدف ليست فارغة أو أن هناك محاولة سابقة.

## 7. استيراد data.sql

بعد نجاح schema فقط، استخدم Command Prompt:

```cmd
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" --default-character-set=utf8mb4 --binary-mode=1 --max-allowed-packet=256M -u root -p fertiliv_copy < "C:\FertilivExport\unpacked\production-db-20260930T194611Z\data.sql" > "C:\FertilivExport\data-import.stdout.log" 2> "C:\FertilivExport\data-import.stderr.log"
```

ثم تحقق:

```cmd
echo %ERRORLEVEL%
type C:\FertilivExport\data-import.stderr.log
```

لا تستخدم `--force`. إذا ظهر خطأ، أوقف العملية، احتفظ بسجل الخطأ، ولا تعاود الاستيراد فوق قاعدة جزئية.

الحل الآمن عند فشل data import هو:

1. حفظ `data-import.stderr.log`.
2. تحديد أن قاعدة الهدف هي `fertiliv_copy`.
3. حذف قاعدة الهدف فقط.
4. إعادة إنشائها.
5. إعادة استيراد schema.
6. معالجة سبب الخطأ.
7. إعادة استيراد data مرة واحدة.

## 8. أرقام التحقق المتوقعة بعد data import

الأرقام من المصدر:

| القياس | المتوقع |
|---|---:|
| عدد الجداول | 137 |
| صفوف المصدر الكاملة | 29,016 |
| صفوف `data.sql` القابلة للاستيراد | 28,974 |
| صفوف WhatsApp runtime المستبعدة عمداً | 42 |
| Views | 0 |

الفرق 42 مقصود، وليس فقداً عشوائياً. الجداول التي لا تستورد بياناتها هي:

- `whatsapp_connections`
- `whatsapp_connection_credentials`
- `whatsapp_embedded_signup_sessions`
- `whatsapp_linked_device_lines`
- `whatsapp_linked_device_credentials`
- `whatsapp_linked_device_sessions`

تم الاحتفاظ بـschema لهذه الجداول، لكن لم يتم استيراد صفوف provider/session/credential منها.

## 9. فحص العدد الإجمالي بدقة

`information_schema.TABLES.TABLE_ROWS` قد يكون تقديرياً مع InnoDB، لذلك استخدم `COUNT(*)` الفعلي. PowerShell 7 يمكنه إنشاء ملف فحص من manifest:

```powershell
$manifest = Import-Csv "$work\table-row-counts.csv"
$lines = @("USE fertiliv_copy;")
foreach ($row in $manifest) {
  $table = $row.table.Replace('`', '``')
  $label = $row.table.Replace("'", "''")
  $expected = $row.row_count
  $lines += "SELECT '$label' AS table_name, COUNT(*) AS actual_rows, $expected AS expected_rows FROM ``$table``;"
}

$checkSql = "$work\rowcount-check.sql"
$lines | Set-Content -Path $checkSql -Encoding utf8NoBOM
```

نفذ الفحص من Command Prompt:

```cmd
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" --default-character-set=utf8mb4 --batch --raw -u root -p fertiliv_copy < "C:\FertilivExport\unpacked\production-db-20260930T194611Z\rowcount-check.sql" > "C:\FertilivExport\rowcount-results.tsv"
```

يجب مقارنة عمودي `actual_rows` و`expected_rows` لكل جدول. مجموع `actual_rows` المتوقع هو **28,974**.

إذا كان PowerShell المستخدم هو Windows PowerShell 5 ولا يدعم `utf8NoBOM`، أنشئ الملف باستخدام PowerShell 7 أو استخدم محرر/أداة لا تغيّر محتوى SQL؛ لا تحفظه في Notepad بصيغة ANSI.

## 10. فحص integrity والفهارس

شغّل `mysqlcheck` بدون `--auto-repair`:

```cmd
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqlcheck.exe" -u root -p --check --all-in-1 fertiliv_copy
```

يجب ألا توجد أخطاء `error`, `corrupt`, أو `Table is marked as crashed`.

قارن الفهارس والقيود مع:

```text
indexes-constraints.csv
```

وفحصاً سريعاً عبر MySQL:

```powershell
& $mysql -u root -p --batch --raw -e `
  "SELECT COUNT(DISTINCT table_name) AS indexed_tables FROM information_schema.statistics WHERE table_schema='fertiliv_copy'; SELECT COUNT(*) AS fk_count FROM information_schema.referential_constraints WHERE constraint_schema='fertiliv_copy';"
```

يجب تفسير أي اختلاف مقابل manifest قبل تشغيل التطبيق، وليس تجاهله.

## 11. إنشاء حساب التطبيق بعد نجاح الاستيراد

لا تستخدم حساب root لتشغيل Fertiliv. بعد اعتماد import، أنشئ حساب التطبيق على Windows بكلمة مرور طويلة يتم حفظها في Password Manager أو secret store، وليس في Git أو المحادثة:

```sql
CREATE USER 'fertiliv_app'@'localhost' IDENTIFIED BY '<GENERATE-A-NEW-STRONG-PASSWORD>';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, CREATE TEMPORARY TABLES, LOCK TABLES
  ON fertiliv_copy.* TO 'fertiliv_app'@'localhost';
FLUSH PRIVILEGES;
```

إذا كان التطبيق سيشغل migrations من نفس الحساب، فستحتاج صلاحيات إضافية مثل `ALTER`, `CREATE`, `INDEX`, و`REFERENCES`. الأفضل في هذا المشروع عدم تشغيل migration replay تلقائياً قبل مراجعة المخطط المستورد.

## 12. قبل تشغيل Fertiliv على Windows

يجب إعداد هذه العناصر خارج الحزمة:

- `DATABASE_URL` إلى قاعدة `fertiliv_copy` أو اسم قاعدة Windows الفعلي.
- `JWT_SECRET` جديد ومستقل.
- OAuth redirect/callback للدومين الجديد.
- Email provider credentials.
- R2/Manus Forge أو storage provider جديد، ثم نقل objects بشكل منفصل.
- Google Calendar credentials إن كانت مطلوبة.
- WhatsApp provider configuration وربط جديد، لأن session/runtime/credentials لم تُنقل.
- HTTPS وreverse proxy وfirewall.
- backup دوري لقاعدة Windows.

لا تنسخ secrets من ملف SQL؛ لا توجد secrets فيه أصلاً.

## 13. الأخطاء الشائعة وحلها

### `ERROR 1064` قرب `CLUSTERED`

تم استخدام الملف الخام بالخطأ. استخدم:

```text
schema-mysql84-candidate.sql
```

ولا تستخدم:

```text
schema-raw-tidb.sql
```

### `ERROR 1273 Unknown collation`

تحقق أن السيرفر MySQL 8.4، وأن الأمر يستخدم:

```text
--default-character-set=utf8mb4
```

لا تغيّر collations عشوائياً؛ قارنها مع schema manifest.

### `ERROR 1044` أو `ERROR 1142` Access denied

حساب الاستيراد لا يملك صلاحيات `CREATE/ALTER/INDEX/REFERENCES`. استخدم حساباً إدارياً على قاعدة الهدف فقط، ولا تمنح صلاحيات على production.

### `ERROR 1050 Table already exists`

قاعدة الهدف ليست فارغة أو تم تشغيل الاستيراد جزئياً. لا تستخدم `--force` ولا تتابع فوقها. احذف وأعد إنشاء `fertiliv_copy` فقط ثم أعد العملية.

### `Packet too large` أو `MySQL server has gone away`

تحقق من:

```sql
SHOW VARIABLES LIKE 'max_allowed_packet';
```

استخدم `--max-allowed-packet=256M` في عميل MySQL. إذا كان حد السيرفر أقل، اضبطه في MySQL 8.4 target فقط عبر `my.ini` أو `SET GLOBAL` وفق صلاحيات المسؤول، ثم أعد تشغيل خدمة Windows عند الحاجة. لا تغيّر production.

### `Incorrect string value`

أعد التنفيذ باستخدام:

```text
--default-character-set=utf8mb4
```

ولا تعِد حفظ `data.sql` بترميز ANSI أو Windows-1252.

### `Cannot add foreign key constraint`

احفظ رسالة الخطأ كاملة. لا تحذف القيد ولا تعطل سلامة schema بشكل دائم. تحقق من أن schema اكتمل، وأن data import تم إلى نفس قاعدة الهدف، وأن إصدار MySQL هو 8.4.x. راجع `indexes-constraints.csv` واطلب إصلاحاً محدداً قبل إعادة المحاولة.

## 14. معيار القبول النهائي

لا تعتبر قاعدة Windows جاهزة للتطبيق إلا بعد تحقق كل الآتي:

- MySQL 8.4.x يعمل.
- قاعدة الهدف اسمها صحيح وليست production.
- 137 table موجودة.
- 0 views متوقعة في هذه النسخة.
- مجموع الصفوف الفعلية = 28,974.
- فروق الصفوف لكل جدول مفهومة ومطابقة للـmanifest.
- `mysqlcheck` يمر دون أخطاء.
- الفهارس والقيود الأساسية موجودة.
- لا يوجد أي provider session أو WhatsApp credential مستعاد من الحزمة.
- لا يوجد secret داخل SQL أو Git أو ملف batch.
- لم يتم تشغيل التطبيق أو workers قبل إعداد `DATABASE_URL` والتكاملات الجديدة.
- تم أخذ backup من قاعدة Windows بعد نجاح import.

## 15. سياسة إعادة المحاولة والتراجع

إذا فشل الاستيراد:

1. لا تلمس production.
2. لا تعاود التشغيل على قاعدة جزئية.
3. احتفظ بسجلات `schema-import.stderr.log` أو `data-import.stderr.log`.
4. احذف قاعدة `fertiliv_copy` على Windows فقط.
5. أعد الإنشاء والاستيراد بعد معالجة الخطأ.
6. لا تستخدم `--force` ولا تحذف foreign keys لإخفاء المشكلة.

**الحالة:** هذا الدليل توثيقي فقط؛ لم يتم تنفيذ أي استيراد إلى Windows ضمن هذه المهمة.
