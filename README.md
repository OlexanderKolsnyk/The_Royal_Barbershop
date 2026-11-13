# The Royal Barbershop

Сайт онлайн-запису та адмінпанель. GitHub Pages показує сайт; Worker на Sites приймає запити; Google Apps Script працює з приватною Google-таблицею. Зовнішніх npm-залежностей немає; потрібен Node.js 22+.

Перевірка й збирання одним запуском: node scripts/check.mjs.

- web/ — джерело інтерфейсу; docs/ — згенерована копія для GitHub Pages. Копії окремо не редагуйте.
- web/style.css — спільні стилі, web/calendar.css — календар. Старі CSS у docs/ залишені для сумісності відкритих сторінок.
- shared/core.js — бізнес-правила; apps-script/ — робота з Google; gateway/ — шлюз; tests/ — перевірки.
- dist/server/index.js — пакет Sites. generated/AppsScript.gs — готовий об’єднаний файл для редактора Google. Згенерований файл і секрети не комітяться.

Адмінка працює за одним паролем власника, без email або акаунта. Пароль дає повні права; зміна завершує попередні сесії. Сім натискань на корону лише відкривають сторінку входу.

Каталог редагується в адмінці. shared/initial.json — початкові дані й резервне відображення, він не замінює робочу таблицю.

Інструкції: docs/OWNER_GUIDE.md, docs/DEPLOYMENT.md, docs/ARCHITECTURE.md, docs/STATUS.md.
