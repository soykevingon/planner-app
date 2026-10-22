/* Kairo help center content (English + Spanish).
   Each article: id, group, title, sum (one line), tags (extra search words), body (HTML).
   Links between articles: <a data-go="article-id">…</a>. Buttons that open a part of the app:
   <button class="btn sm" data-do="settings|new|search|import|feedback|calendar|radar|projects|today">…</button> */
window.KAIRO_HELP = {
en: {
  ui: {title: 'Help & how-tos', search: 'Search the guides (e.g. “late”, “share”, “voice”)', back: 'All guides', none: 'No guide matches that. Try another word, or send feedback and ask.',
       stuck: 'Still stuck?', ask: 'Send feedback', related: 'Related', open: 'Open help'},
  groups: [['basics', 'Start here'], ['plan', 'Planning your work'], ['time', 'Calendar & reminders'], ['org', 'Spaces & sharing'], ['more', 'Getting work in & out'], ['app', 'Your account & devices']],
  articles: [
  {id: 'start', group: 'basics', title: 'Getting started in 5 minutes', sum: 'What Kairo does and the first things to set up.', tags: 'welcome intro first time new user setup onboarding',
   body: `<p>Kairo is a planner that tells you <b>what to work on now</b>. You add your tasks with a deadline and how long they take; Kairo ranks them and builds a plan for today that fits the hours you really have.</p>
<ol>
<li><b>Set your time.</b> Click the circle with your initials (top right) → <b>Settings</b>. Check your work hours, focus hours per day and free hours on weeknights.</li>
<li><b>Check your spaces.</b> Spaces are areas of your life (Work, University, Home…). Each one is planned in certain hours. See <a data-go="spaces">Spaces and planned hours</a>.</li>
<li><b>Add your first tasks.</b> Press <b>+ New → Task</b>. A name, a deadline and the effort are enough. See <a data-go="task">Create a task</a>.</li>
<li><b>Open the Today tab.</b> That is your plan. Work from the top down.</li>
<li><b>Close what you finish.</b> Open the task → <b>Close task</b>. Kairo logs the time and replans the rest.</li>
</ol>
<div class="tip"><b>The five tabs:</b> <b>Today</b> (your plan) · <b>Radar</b> (everything coming, by priority) · <b>Projects</b> · <b>Calendar</b> (events and reminders) · <b>Reports</b> (what got done).</div>
<p><button class="btn sm" data-do="settings">Open Settings</button> <button class="btn sm" data-do="new">+ New task</button></p>`},
  {id: 'scale', group: 'basics', title: 'Words and numbers Kairo uses', sum: '1 is the highest, P1–P4, Ready by, Late, At risk…', tags: 'glossary meaning legend priority number 1 5 p1 p2 p3 p4 importance urgency',
   body: `<ul>
<li><b>Importance 1–5</b>: how much it matters to your goals. <b>1 = critical</b>, 5 = low impact.</li>
<li><b>Urgency 1–5</b>: how soon someone needs it. <b>1 = someone is waiting now</b>, 5 = can wait.</li>
<li><b>Score 0–100 and P1–P4</b>: Kairo’s ranking, made from importance, urgency and how close the deadline is. P1 is the top. See <a data-go="priority">How Kairo ranks your work</a>.</li>
<li><b>Effort</b>: hours of real work the task needs (not the hours until the deadline).</li>
<li><b>Ready by</b>: the date the task should be finished so nothing is left for the last day.</li>
<li><b>Start by</b>: the latest day to start and still make it.</li>
<li><b>At risk</b>: at the current pace it won’t be ready in time.</li>
<li><b>Late</b>: its Ready by date already passed. <b>Overdue</b>: the deadline itself passed.</li>
<li><b>Low-hanging fruit</b>: small tasks that still matter. Good for a gap between meetings.</li>
</ul>`},
  {id: 'today', group: 'plan', title: 'The Today tab: your plan', sum: 'How the plan is built and how to use it during the day.', tags: 'plan daily focus hours capacity low-hanging fruit next days',
   body: `<p><b>Today’s plan</b> lists what to work on, in order, until your focus hours for the day are full. Kairo puts first: emergencies, then overdue, late and at-risk work, then whatever must start today, then the rest by start date.</p>
<ul>
<li>Your hours come from <b>Settings</b>; meetings and events in the <b>Calendar</b> take time away from that day.</li>
<li>Work spaces are planned in work hours; University, Home and similar spaces in evenings and weekends (see <a data-go="spaces">Spaces</a>).</li>
<li>You can change today’s start and end time at the top of the plan if your day is different.</li>
<li><b>Low-hanging fruit</b> shows quick tasks worth doing when you have a short gap.</li>
<li><b>Recurring</b> and <b>Routine checks</b> show the repeating work due today.</li>
</ul>
<div class="tip">Tap any task to see its details: why it is ranked there, its Ready by date and what is left.</div>`},
  {id: 'task', group: 'plan', title: 'Create a task', sum: 'The fields that matter and the ones you can skip.', tags: 'add new task form deadline effort importance urgency more options client files notes',
   body: `<ol>
<li>Press <b>+ New → Task</b>.</li>
<li>Write the <b>name</b>, choose the <b>space</b> and the <b>deadline</b>.</li>
<li>Pick the <b>effort</b>: how many hours of work it really needs. Choose <i>None</i> for reminders that take no time.</li>
<li>Set <b>Importance</b> and <b>Urgency</b> (1 is the highest).</li>
<li>Press <b>Save</b>. The line under the form shows how Kairo will plan it.</li>
</ol>
<p><b>More options</b> has the rest, all optional: type (Normal, Steady, Emergency), project, client, place and travel time, progress, <a data-go="ready">Be ready</a>, custom fields, files, people in charge, email notifications and notes.</p>
<div class="tip"><b>Steady</b> is for ongoing work without one deadline (e.g. 4 hours per week of studying). Kairo reserves those hours every week.</div>
<p><button class="btn sm" data-do="new">+ New task</button></p>`},
  {id: 'priority', group: 'plan', title: 'How Kairo ranks your work', sum: 'The score, the P1–P4 tiers and the order of the lists.', tags: 'score ranking order why first priority p1 tier formula',
   body: `<p>Every open task gets a <b>score from 0 to 100</b>:</p>
<ul><li>40% importance</li><li>25% urgency</li><li>35% deadline pressure (how much work is left compared with the days left)</li></ul>
<p>The score gives the tier: <b>P1</b> (top) to <b>P4</b>. The lists then follow this order: <b>Emergency → Overdue → Late → At risk → Start today → by start date → no deadline</b>.</p>
<div class="tip">If something is too high or too low, change its importance or urgency, or fix the effort. A big effort with a near deadline always pushes a task up.</div>`},
  {id: 'ready', group: 'plan', title: 'Ready by, Late and At risk', sum: 'Why a task says “Late” before its deadline, and how to change it.', tags: 'ready by buffer late deadline fake deadline at risk start by early be ready',
   body: `<p>Kairo plans big tasks to be <b>finished a little before the deadline</b>, so there is room for surprises. That earlier date is <b>Ready by</b>. After it passes, the task shows <b>Late</b> even if the real deadline hasn’t come yet.</p>
<p>The buffer is automatic and depends on the size of the task:</p>
<ul><li>Less than 2 hours of work: <b>no buffer</b> (just the deadline)</li><li>2–4 hours: 1 day before</li><li>4–8 hours: 2 days before</li><li>A full day of work or more: the buffer in <b>Settings → Buffer for big tasks</b> (7 days unless you change it)</li></ul>
<p><b>To change it for one task:</b> open the task → Edit → <b>More options → Be ready</b> → choose <i>On the due date</i>, 1–3 days, or 1–2 weeks before.</p>
<p><b>At risk</b> means that with the hours you have, the work won’t be ready in time. Start it, lower the effort if you overestimated, or move the deadline.</p>
<div class="tip">Bills use their own reminder days instead of this buffer.</div>`},
  {id: 'projects', group: 'plan', title: 'Projects and subtasks', sum: 'Break a big goal into tasks with their own dates.', tags: 'project subtask parent goal roadmap break down',
   body: `<ol>
<li>Press <b>+ New → Project</b>. Give it a name, space and deadline. A project doesn’t need an effort: its tasks carry the work.</li>
<li>Add its tasks: open the project → <b>Add task</b>, or in any task choose <b>More options → Part of project</b>.</li>
<li>Each task can have its own deadline. If not, it uses the project’s deadline (you can make tasks due some days earlier).</li>
</ol>
<p>The <b>Projects</b> tab shows every project with its progress bar, what is late and what comes next. On the Radar, use the <b>Projects</b> or <b>Subtasks</b> view to see only those.</p>
<p><button class="btn sm" data-do="projects">Open Projects</button></p>`},
  {id: 'recurring', group: 'plan', title: 'Recurring work and bills', sum: 'Daily checks, monthly reports, rent and other payments.', tags: 'recurring repeat daily weekly monthly quarterly bill payment rent reminder routine',
   body: `<ol>
<li>Press <b>+ New → Recurring</b>.</li>
<li>Write the name and choose how it repeats: every few hours, daily, weekly, monthly or quarterly.</li>
<li>Choose <b>Create the task</b>: how many days before the due day it should appear.</li>
<li>For a <b>bill</b>, put it in the Finances space and fill in the <b>payment amount</b>. It shows under <b>Payments due</b> and you press <b>Mark paid</b>.</li>
</ol>
<div class="tip">Short daily checks show under <b>Routine checks</b>; longer ones enter the plan like any task.</div>`},
  {id: 'emergency', group: 'plan', title: 'Emergencies and after-hours jobs', sum: 'Work that jumps the line, and night or weekend work.', tags: 'emergency urgent outage after hours maintenance window night',
   body: `<p><b>Emergency</b> (<b>+ New → Emergency</b>): something that needs you now. It goes first in today’s plan and everything else moves down.</p>
<p><b>After hours</b>: in the task form, under <b>When</b>, choose <b>After hours</b> and set the date and time (e.g. a maintenance window at 10 pm). It doesn’t use your focus hours and stays off the radar; it shows in its own <b>After-hours jobs</b> list and in the Calendar.</p>`},
  {id: 'radar', group: 'plan', title: 'The Radar', sum: 'See everything coming, by importance and urgency.', tags: 'radar eisenhower matrix quadrant horizon week month all time filter view',
   body: `<p>The Radar places each task by <b>importance</b> (up = more important) and <b>urgency</b> (right = more urgent). The top-right corner is what to do first.</p>
<ul>
<li><b>Look ahead</b>: Today, Week, 30 days, 90 days, 6 months or All time.</li>
<li><b>View</b>: All, Projects or Subtasks.</li>
<li><b>Space</b>: one space, all, or only shared ones.</li>
</ul>
<p>The lists beside it (Must do this week, Later…) follow the same filters.</p>
<p><button class="btn sm" data-do="radar">Open the Radar</button></p>`},
  {id: 'calendar', group: 'time', title: 'Calendar and events (by voice or text)', sum: 'Add meetings and appointments by saying or typing them.', tags: 'calendar event meeting appointment voice speak microphone dictate natural language',
   body: `<ol>
<li>Press <b>+ New → Event</b>, or open the <b>Calendar</b> tab and use the box at the top.</li>
<li><b>Type or say it</b> in a normal sentence, in English or Spanish, e.g. <i>“dentist Friday at 3:30, remind me 1 hour before”</i> or <i>“reunión mañana a las 8 en la oficina, recuérdame 30 minutos antes”</i>.</li>
<li>To speak, press the <b>microphone</b> and choose the language next to it. Your browser will ask for microphone permission the first time.</li>
<li>Kairo fills in the date, time, place and reminders. Check the preview and press <b>Add</b>. For every detail, use <b>+ Event</b> instead.</li>
</ol>
<p>Events take time from that day’s plan, so Kairo doesn’t give you more work than fits.</p>
<div class="tip">Voice works best in Chrome and Edge, and on Android. If the microphone button doesn’t appear, your browser doesn’t support it; type instead.</div>
<p><button class="btn sm" data-do="calendar">Open Calendar</button></p>`},
  {id: 'reminders', group: 'time', title: 'Reminders and notifications', sum: 'Get alerted by Kairo, Google Calendar or Outlook.', tags: 'reminder notification alert alarm google outlook ics phone',
   body: `<p>There are two ways to get reminders for an event:</p>
<ul>
<li><b>From Kairo</b>: in the Calendar tab press <b>Turn on reminders</b> (it appears once an event has a reminder) and allow notifications. They appear while Kairo is open (in a tab or installed as an app).</li>
<li><b>From your own calendar</b>: open the event and press <b>Google Calendar</b>, <b>Outlook</b> or <b>Download .ics</b>. Your calendar app will then alert you on your phone even if Kairo is closed.</li>
</ul>
<div class="tip">Reminders when Kairo is fully closed, and automatic syncing with Microsoft 365 and Google, are coming in a later version.</div>`},
  {id: 'spaces', group: 'org', title: 'Spaces and planned hours', sum: 'Separate work, school and home, each in its own hours.', tags: 'space category area work university home personal finances hours evenings color',
   body: `<p>A <b>space</b> is an area of your life. Each task belongs to one. Each space says <b>when its work is planned</b>:</p>
<ul><li><b>Work hours</b> (e.g. 8:30–5:30, Monday to Friday)</li><li><b>Evenings &amp; weekends</b> (school, home, personal)</li><li><b>Any time</b></li><li><b>Custom hours</b> (your own days and times)</li></ul>
<p><b>To add or change spaces:</b> your initials → <b>Settings → Spaces</b>. You can rename them, change the color, the planned hours, or remove them.</p>
<p>Use the space chips at the top of the lists to see just one space.</p>
<p><button class="btn sm" data-do="settings">Open Settings</button></p>`},
  {id: 'sharing', group: 'org', title: 'Share a space with someone', sum: 'Plan house chores or a team project together.', tags: 'share invite member family team collaborate shared space people',
   body: `<ol>
<li>The other person needs a Kairo account first (they sign up with their email).</li>
<li>Go to your initials → <b>Settings → Spaces</b>, find the space and press <b>Share</b>.</li>
<li>Write their email and press <b>Invite</b>.</li>
</ol>
<p>Everyone in the space sees and edits its tasks. Shared items have a <b>Shared</b> badge; hover or tap it to see who it’s shared with and who added it. The <b>All shared</b> filter shows only shared work.</p>
<div class="tip">Only that space is shared. Your other spaces stay private.</div>`},
  {id: 'close', group: 'more', title: 'Close tasks and see reports', sum: 'Log time when you finish, then review what got done.', tags: 'close done finish complete time spent report hours client closed work',
   body: `<ol>
<li>Open the task and press <b>Close task</b>.</li>
<li>Confirm when it was completed and the <b>time spent</b>, and add a comment if you like.</li>
</ol>
<p>The <b>Reports</b> tab shows closed work and <b>time by client</b> for the dates you choose. Handy for timesheets and for seeing where your week went.</p>
<div class="tip">Closed by mistake? Open it from <b>Completed</b> and edit the close-out.</div>`},
  {id: 'email', group: 'more', title: 'Turn an email into a task', sum: 'Paste an email, or share it from your phone.', tags: 'email mail outlook gmail paste share phone forward',
   body: `<p><b>On a computer:</b> copy the email, press <b>+ New → From an email</b> and paste it. The subject becomes the task name and the email is kept in the notes.</p>
<p><b>On a phone:</b> with Kairo installed (see <a data-go="install">Install Kairo</a>), open the email or any page, press <b>Share</b> and choose <b>Kairo</b>. A new task opens with the text already in it.</p>`},
  {id: 'import', group: 'more', title: 'Import from another app', sum: 'Bring tasks from ClickUp, Todoist, Planner, Excel and more.', tags: 'import csv json excel sheets clickup todoist asana trello planner migrate template',
   body: `<ol>
<li>Export your tasks from the other app as <b>CSV</b> or <b>JSON</b> (or save your spreadsheet as CSV).</li>
<li>Your initials → <b>Import from another app</b> and choose the file.</li>
<li>Check the preview and press <b>Import</b>.</li>
</ol>
<p>Kairo reads columns like name, due date, priority, project or list, status, effort and description. Not sure about the format? Press <b>Download CSV template</b>, fill it in Excel or Google Sheets and import it.</p>
<p><button class="btn sm" data-do="import">Open import</button></p>`},
  {id: 'search', group: 'more', title: 'Search and keyboard shortcuts', sum: 'Find anything fast.', tags: 'search find shortcut keyboard keys slash ctrl k',
   body: `<ul>
<li><kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd>: search tasks and projects. <kbd>Enter</kbd> opens the first result.</li>
<li><kbd>?</kbd>: open this help.</li>
<li><kbd>Esc</kbd>: close any window.</li>
</ul>
<p>On a phone, use the magnifying glass at the top.</p>
<p><button class="btn sm" data-do="search">Search now</button></p>`},
  {id: 'install', group: 'app', title: 'Install Kairo on your phone or computer', sum: 'Use it like a normal app, with its own icon.', tags: 'install app home screen iphone android pwa desktop icon',
   body: `<ul>
<li><b>iPhone (Safari):</b> press <b>Share</b> → <b>Add to Home Screen</b>.</li>
<li><b>Android (Chrome):</b> menu ⋮ → <b>Install app</b> (or <b>Add to Home screen</b>).</li>
<li><b>Computer (Chrome or Edge):</b> the install icon at the right of the address bar, or menu → <b>Install Kairo</b>.</li>
</ul>
<p>Installed, it opens in its own window, works offline and appears in the phone’s Share menu.</p>`},
  {id: 'sync', group: 'app', title: 'Sync, offline and several devices', sum: 'Your data on every device, even without internet.', tags: 'sync offline internet devices phone computer cloud backup not syncing pending',
   body: `<p>Sign in with the same account on each device and your data stays in sync. Kairo saves on your device first and sends changes to the cloud in the background, so it <b>works without internet</b>; changes go up when you reconnect.</p>
<ul>
<li>The dot next to your initials shows the sync state; open the menu to see details.</li>
<li>Something missing on another device? Open the menu → <b>Sync now</b>.</li>
<li>Bringing an app back to the screen also syncs it.</li>
</ul>`},
  {id: 'account', group: 'app', title: 'Account, password and feedback', sum: 'Change your password, sign out, or tell us what to improve.', tags: 'account password reset forgot sign out log out profile feedback bug',
   body: `<ul>
<li><b>Change password:</b> your initials → <b>Change password</b>.</li>
<li><b>Forgot it:</b> on the sign-in page press <b>Forgot password?</b> and check your email.</li>
<li><b>Sign out:</b> your initials → <b>Sign out</b>. Do it on shared computers.</li>
<li><b>Feedback:</b> your initials → <b>Send feedback</b>. It goes privately to the app’s owner.</li>
</ul>
<p><button class="btn sm" data-do="feedback">Send feedback</button></p>`}
  ]
},
es: {
  ui: {title: 'Ayuda y guías', search: 'Busca en las guías (ej. “tarde”, “compartir”, “voz”)', back: 'Todas las guías', none: 'Ninguna guía coincide. Prueba otra palabra o envía tu pregunta en comentarios.',
       stuck: '¿Todavía con dudas?', ask: 'Enviar comentarios', related: 'Relacionado', open: 'Abrir ayuda'},
  groups: [['basics', 'Empieza aquí'], ['plan', 'Planificar tu trabajo'], ['time', 'Calendario y recordatorios'], ['org', 'Espacios y compartir'], ['more', 'Entrada y salida de trabajo'], ['app', 'Tu cuenta y dispositivos']],
  articles: [
  {id: 'start', group: 'basics', title: 'Empieza en 5 minutos', sum: 'Qué hace Kairo y lo primero que debes configurar.', tags: 'bienvenida inicio primera vez nuevo usuario configurar empezar',
   body: `<p>Kairo es un planificador que te dice <b>en qué trabajar ahora</b>. Añades tus tareas con fecha límite y cuánto tiempo toman; Kairo las ordena y arma un plan para hoy que cabe en las horas que de verdad tienes.</p>
<ol>
<li><b>Configura tu tiempo.</b> Toca el círculo con tus iniciales (arriba a la derecha) → <b>Settings</b>. Revisa tu horario de trabajo, las horas de enfoque por día y las horas libres en las noches.</li>
<li><b>Revisa tus espacios.</b> Los espacios son áreas de tu vida (Trabajo, Universidad, Casa…). Cada uno se planifica en ciertas horas. Mira <a data-go="spaces">Espacios y horas planificadas</a>.</li>
<li><b>Añade tus primeras tareas.</b> Presiona <b>+ New → Task</b>. Con nombre, fecha límite y esfuerzo basta. Mira <a data-go="task">Crear una tarea</a>.</li>
<li><b>Abre la pestaña Today.</b> Ese es tu plan. Trabaja de arriba hacia abajo.</li>
<li><b>Cierra lo que termines.</b> Abre la tarea → <b>Close task</b>. Kairo registra el tiempo y replanifica lo demás.</li>
</ol>
<div class="tip"><b>Las cinco pestañas:</b> <b>Today</b> (tu plan) · <b>Radar</b> (todo lo que viene, por prioridad) · <b>Projects</b> (proyectos) · <b>Calendar</b> (eventos y recordatorios) · <b>Reports</b> (lo que se hizo).</div>
<p><button class="btn sm" data-do="settings">Abrir Settings</button> <button class="btn sm" data-do="new">+ Nueva tarea</button></p>`},
  {id: 'scale', group: 'basics', title: 'Palabras y números que usa Kairo', sum: '1 es lo más alto, P1–P4, Ready by, Late, At risk…', tags: 'glosario significado leyenda prioridad numero 1 5 p1 p2 p3 p4 importancia urgencia',
   body: `<ul>
<li><b>Importance (importancia) 1–5</b>: cuánto importa para tus metas. <b>1 = crítico</b>, 5 = poco impacto.</li>
<li><b>Urgency (urgencia) 1–5</b>: qué tan pronto alguien lo necesita. <b>1 = alguien está esperando ya</b>, 5 = puede esperar.</li>
<li><b>Puntuación 0–100 y P1–P4</b>: el orden de Kairo, calculado con importancia, urgencia y qué tan cerca está la fecha límite. P1 es lo más alto. Mira <a data-go="priority">Cómo Kairo ordena tu trabajo</a>.</li>
<li><b>Effort (esfuerzo)</b>: horas de trabajo real que necesita la tarea (no las horas que faltan para la fecha).</li>
<li><b>Ready by (lista para)</b>: la fecha en que la tarea debe estar terminada para no dejar nada para el último día.</li>
<li><b>Start by (empezar antes de)</b>: el último día para empezar y llegar a tiempo.</li>
<li><b>At risk (en riesgo)</b>: al ritmo actual no estará lista a tiempo.</li>
<li><b>Late (tarde)</b>: ya pasó su fecha Ready by. <b>Overdue (vencida)</b>: ya pasó la fecha límite.</li>
<li><b>Low-hanging fruit</b>: tareas pequeñas que igual importan. Buenas para un hueco entre reuniones.</li>
</ul>`},
  {id: 'today', group: 'plan', title: 'La pestaña Today: tu plan', sum: 'Cómo se arma el plan y cómo usarlo durante el día.', tags: 'plan hoy diario enfoque horas capacidad low-hanging fruit proximos dias',
   body: `<p><b>Today’s plan</b> te muestra en qué trabajar, en orden, hasta llenar tus horas de enfoque del día. Kairo pone primero: emergencias, luego lo vencido, lo tarde y lo que está en riesgo, después lo que debe empezar hoy y el resto por fecha de inicio.</p>
<ul>
<li>Tus horas salen de <b>Settings</b>; las reuniones y eventos del <b>Calendar</b> le quitan tiempo a ese día.</li>
<li>Los espacios de trabajo se planifican en horario de trabajo; Universidad, Casa y parecidos en las noches y fines de semana (mira <a data-go="spaces">Espacios</a>).</li>
<li>Si tu día es distinto, puedes cambiar la hora de inicio y de fin de hoy arriba del plan.</li>
<li><b>Low-hanging fruit</b> muestra tareas rápidas que vale la pena hacer cuando tienes un rato corto.</li>
<li><b>Recurring</b> y <b>Routine checks</b> muestran el trabajo repetitivo que toca hoy.</li>
</ul>
<div class="tip">Toca cualquier tarea para ver sus detalles: por qué está en ese lugar, su fecha Ready by y lo que falta.</div>`},
  {id: 'task', group: 'plan', title: 'Crear una tarea', sum: 'Los campos que importan y los que puedes dejar en blanco.', tags: 'añadir nueva tarea formulario fecha limite esfuerzo importancia urgencia mas opciones cliente archivos notas',
   body: `<ol>
<li>Presiona <b>+ New → Task</b>.</li>
<li>Escribe el <b>nombre</b>, escoge el <b>espacio</b> (Space) y la <b>fecha límite</b> (Deadline).</li>
<li>Escoge el <b>esfuerzo</b> (Effort): cuántas horas de trabajo necesita de verdad. Escoge <i>None</i> para recordatorios que no toman tiempo.</li>
<li>Marca <b>Importance</b> y <b>Urgency</b> (1 es lo más alto).</li>
<li>Presiona <b>Save</b>. La línea debajo del formulario te dice cómo la va a planificar Kairo.</li>
</ol>
<p><b>More options</b> tiene lo demás, todo opcional: tipo (Normal, Steady, Emergency), proyecto, cliente, lugar y tiempo de viaje, progreso, <a data-go="ready">Be ready</a>, campos personalizados, archivos, responsables, avisos por email y notas.</p>
<div class="tip"><b>Steady</b> es para trabajo continuo sin una sola fecha límite (ej. 4 horas por semana de estudio). Kairo reserva esas horas cada semana.</div>
<p><button class="btn sm" data-do="new">+ Nueva tarea</button></p>`},
  {id: 'priority', group: 'plan', title: 'Cómo Kairo ordena tu trabajo', sum: 'La puntuación, los niveles P1–P4 y el orden de las listas.', tags: 'puntuacion orden por que primero prioridad p1 nivel formula',
   body: `<p>Cada tarea abierta recibe una <b>puntuación de 0 a 100</b>:</p>
<ul><li>40% importancia</li><li>25% urgencia</li><li>35% presión de la fecha (cuánto trabajo falta comparado con los días que quedan)</li></ul>
<p>La puntuación da el nivel: <b>P1</b> (lo más alto) a <b>P4</b>. Las listas siguen este orden: <b>Emergency → Overdue → Late → At risk → Start today → por fecha de inicio → sin fecha</b>.</p>
<div class="tip">Si algo sale muy alto o muy bajo, cambia su importancia o urgencia, o corrige el esfuerzo. Un esfuerzo grande con la fecha cerca siempre sube una tarea.</div>`},
  {id: 'ready', group: 'plan', title: 'Ready by, Late y At risk', sum: 'Por qué una tarea dice “Late” antes de su fecha límite y cómo cambiarlo.', tags: 'ready by margen tarde fecha limite falsa en riesgo start by antes be ready lista',
   body: `<p>Kairo planifica las tareas grandes para que estén <b>terminadas un poco antes de la fecha límite</b>, y así haya espacio para imprevistos. Esa fecha más temprana es <b>Ready by</b>. Cuando pasa, la tarea dice <b>Late</b> aunque la fecha límite real todavía no haya llegado.</p>
<p>El margen es automático y depende del tamaño de la tarea:</p>
<ul><li>Menos de 2 horas de trabajo: <b>sin margen</b> (solo la fecha límite)</li><li>2–4 horas: 1 día antes</li><li>4–8 horas: 2 días antes</li><li>Un día completo de trabajo o más: el margen de <b>Settings → Buffer for big tasks</b> (7 días si no lo cambias)</li></ul>
<p><b>Para cambiarlo en una sola tarea:</b> abre la tarea → Edit → <b>More options → Be ready</b> → escoge <i>On the due date</i> (en la fecha límite), 1–3 días o 1–2 semanas antes.</p>
<p><b>At risk</b> quiere decir que con las horas que tienes no va a estar lista a tiempo. Empiézala, baja el esfuerzo si lo sobreestimaste o mueve la fecha.</p>
<div class="tip">Los pagos usan sus propios días de aviso en vez de este margen.</div>`},
  {id: 'projects', group: 'plan', title: 'Proyectos y subtareas', sum: 'Divide una meta grande en tareas con sus propias fechas.', tags: 'proyecto subtarea meta roadmap dividir',
   body: `<ol>
<li>Presiona <b>+ New → Project</b>. Ponle nombre, espacio y fecha límite. Un proyecto no necesita esfuerzo: sus tareas llevan el trabajo.</li>
<li>Añade sus tareas: abre el proyecto → <b>Add task</b>, o en cualquier tarea escoge <b>More options → Part of project</b>.</li>
<li>Cada tarea puede tener su propia fecha. Si no, usa la del proyecto (puedes hacer que venzan unos días antes).</li>
</ol>
<p>La pestaña <b>Projects</b> muestra cada proyecto con su barra de progreso, lo que va tarde y lo que sigue. En el Radar, usa la vista <b>Projects</b> o <b>Subtasks</b> para ver solo eso.</p>
<p><button class="btn sm" data-do="projects">Abrir Projects</button></p>`},
  {id: 'recurring', group: 'plan', title: 'Trabajo recurrente y pagos', sum: 'Revisiones diarias, informes mensuales, renta y otros pagos.', tags: 'recurrente repetir diario semanal mensual trimestral factura pago renta recordatorio rutina',
   body: `<ol>
<li>Presiona <b>+ New → Recurring</b>.</li>
<li>Escribe el nombre y escoge cada cuánto se repite: cada ciertas horas, diario, semanal, mensual o trimestral.</li>
<li>Escoge <b>Create the task</b>: cuántos días antes del día que vence debe aparecer.</li>
<li>Para un <b>pago</b>, ponlo en el espacio Finances y llena el <b>monto</b> (Payment amount). Aparece en <b>Payments due</b> y presionas <b>Mark paid</b>.</li>
</ol>
<div class="tip">Las revisiones diarias cortas salen en <b>Routine checks</b>; las más largas entran al plan como cualquier tarea.</div>`},
  {id: 'emergency', group: 'plan', title: 'Emergencias y trabajos fuera de horario', sum: 'Trabajo que se salta la fila, y trabajo de noche o fin de semana.', tags: 'emergencia urgente caida fuera de horario after hours mantenimiento noche',
   body: `<p><b>Emergency</b> (<b>+ New → Emergency</b>): algo que te necesita ahora. Va primero en el plan de hoy y todo lo demás baja.</p>
<p><b>After hours</b> (fuera de horario): en el formulario de la tarea, en <b>When</b>, escoge <b>After hours</b> y pon la fecha y hora (ej. una ventana de mantenimiento a las 10 pm). No usa tus horas de enfoque y no sale en el radar; aparece en su propia lista <b>After-hours jobs</b> y en el Calendar.</p>`},
  {id: 'radar', group: 'plan', title: 'El Radar', sum: 'Mira todo lo que viene, por importancia y urgencia.', tags: 'radar eisenhower matriz cuadrante horizonte semana mes todo filtro vista',
   body: `<p>El Radar coloca cada tarea según su <b>importancia</b> (arriba = más importante) y su <b>urgencia</b> (derecha = más urgente). La esquina de arriba a la derecha es lo primero que debes hacer.</p>
<ul>
<li><b>Look ahead</b> (mirar hacia adelante): Today, Week, 30 days, 90 days, 6 months o All time.</li>
<li><b>Vista</b>: All, Projects o Subtasks.</li>
<li><b>Espacio</b>: uno, todos, o solo los compartidos.</li>
</ul>
<p>Las listas al lado (Must do this week, Later…) siguen los mismos filtros.</p>
<p><button class="btn sm" data-do="radar">Abrir el Radar</button></p>`},
  {id: 'calendar', group: 'time', title: 'Calendario y eventos (por voz o texto)', sum: 'Añade reuniones y citas diciéndolas o escribiéndolas.', tags: 'calendario evento reunion cita voz hablar microfono dictar',
   body: `<ol>
<li>Presiona <b>+ New → Event</b>, o abre la pestaña <b>Calendar</b> y usa la caja de arriba.</li>
<li><b>Escríbelo o dilo</b> como una oración normal, en español o inglés, ej. <i>“reunión mañana a las 8 en la oficina, recuérdame 30 minutos antes”</i> o <i>“dentista el viernes a las 3:30, recuérdame 1 hora antes”</i>.</li>
<li>Para hablar, presiona el <b>micrófono</b> y escoge el idioma al lado. El navegador te pedirá permiso para el micrófono la primera vez.</li>
<li>Kairo llena la fecha, hora, lugar y recordatorios. Revisa la vista previa y presiona <b>Add</b>. Para todos los detalles, usa <b>+ Event</b>.</li>
</ol>
<p>Los eventos le quitan tiempo al plan de ese día, así Kairo no te da más trabajo del que cabe.</p>
<div class="tip">La voz funciona mejor en Chrome y Edge, y en Android. Si no aparece el botón del micrófono, tu navegador no lo permite; escríbelo.</div>
<p><button class="btn sm" data-do="calendar">Abrir Calendar</button></p>`},
  {id: 'reminders', group: 'time', title: 'Recordatorios y notificaciones', sum: 'Recibe avisos de Kairo, Google Calendar u Outlook.', tags: 'recordatorio notificacion aviso alarma google outlook ics telefono',
   body: `<p>Hay dos formas de recibir recordatorios de un evento:</p>
<ul>
<li><b>Desde Kairo</b>: en la pestaña Calendar presiona <b>Turn on reminders</b> (aparece cuando un evento tiene recordatorio) y permite las notificaciones. Salen mientras Kairo esté abierto (en una pestaña o instalado como app).</li>
<li><b>Desde tu propio calendario</b>: abre el evento y presiona <b>Google Calendar</b>, <b>Outlook</b> o <b>Download .ics</b>. Tu calendario te avisará en el teléfono aunque Kairo esté cerrado.</li>
</ul>
<div class="tip">Los recordatorios con Kairo totalmente cerrado y la sincronización automática con Microsoft 365 y Google vienen en una próxima versión.</div>`},
  {id: 'spaces', group: 'org', title: 'Espacios y horas planificadas', sum: 'Separa trabajo, estudios y casa, cada uno en sus horas.', tags: 'espacio categoria area trabajo universidad casa personal finanzas horas noches color',
   body: `<p>Un <b>espacio</b> es un área de tu vida. Cada tarea pertenece a uno. Cada espacio dice <b>cuándo se planifica su trabajo</b>:</p>
<ul><li><b>Work hours</b>: horario de trabajo (ej. 8:30–5:30, lunes a viernes)</li><li><b>Evenings &amp; weekends</b>: noches y fines de semana (estudios, casa, personal)</li><li><b>Any time</b>: a cualquier hora</li><li><b>Custom hours</b>: tus propios días y horas</li></ul>
<p><b>Para añadir o cambiar espacios:</b> tus iniciales → <b>Settings → Spaces</b>. Puedes cambiarles el nombre, el color, las horas planificadas o borrarlos.</p>
<p>Usa los botones de espacio arriba de las listas para ver solo uno.</p>
<p><button class="btn sm" data-do="settings">Abrir Settings</button></p>`},
  {id: 'sharing', group: 'org', title: 'Compartir un espacio con alguien', sum: 'Planifiquen juntos las tareas de la casa o un proyecto de equipo.', tags: 'compartir invitar miembro familia equipo colaborar espacio compartido personas',
   body: `<ol>
<li>La otra persona necesita una cuenta de Kairo primero (se registra con su email).</li>
<li>Ve a tus iniciales → <b>Settings → Spaces</b>, busca el espacio y presiona <b>Share</b>.</li>
<li>Escribe su email y presiona <b>Invite</b>.</li>
</ol>
<p>Todos en el espacio ven y editan sus tareas. Lo compartido tiene la etiqueta <b>Shared</b>; pasa el cursor o tócala para ver con quién está compartido y quién lo añadió. El filtro <b>All shared</b> muestra solo lo compartido.</p>
<div class="tip">Solo se comparte ese espacio. Tus otros espacios siguen privados.</div>`},
  {id: 'close', group: 'more', title: 'Cerrar tareas y ver informes', sum: 'Registra el tiempo al terminar y repasa lo que se hizo.', tags: 'cerrar terminar completar hecho tiempo invertido informe horas cliente reporte',
   body: `<ol>
<li>Abre la tarea y presiona <b>Close task</b>.</li>
<li>Confirma cuándo se completó y el <b>tiempo invertido</b> (Time spent), y añade un comentario si quieres.</li>
</ol>
<p>La pestaña <b>Reports</b> muestra el trabajo cerrado y el <b>tiempo por cliente</b> en las fechas que escojas. Útil para hojas de tiempo y para ver a dónde se fue tu semana.</p>
<div class="tip">¿La cerraste por error? Ábrela desde <b>Completed</b> y edita el cierre.</div>`},
  {id: 'email', group: 'more', title: 'Convertir un email en tarea', sum: 'Pega un email o compártelo desde tu teléfono.', tags: 'email correo outlook gmail pegar compartir telefono reenviar',
   body: `<p><b>En la computadora:</b> copia el email, presiona <b>+ New → From an email</b> y pégalo. El asunto se vuelve el nombre de la tarea y el email se guarda en las notas.</p>
<p><b>En el teléfono:</b> con Kairo instalado (mira <a data-go="install">Instalar Kairo</a>), abre el email o cualquier página, presiona <b>Compartir</b> y escoge <b>Kairo</b>. Se abre una tarea nueva con el texto ya puesto.</p>`},
  {id: 'import', group: 'more', title: 'Importar desde otra app', sum: 'Trae tareas de ClickUp, Todoist, Planner, Excel y más.', tags: 'importar csv json excel sheets clickup todoist asana trello planner migrar plantilla',
   body: `<ol>
<li>Exporta tus tareas de la otra app como <b>CSV</b> o <b>JSON</b> (o guarda tu hoja de cálculo como CSV).</li>
<li>Tus iniciales → <b>Import from another app</b> y escoge el archivo.</li>
<li>Revisa la vista previa y presiona <b>Import</b>.</li>
</ol>
<p>Kairo lee columnas como nombre, fecha límite, prioridad, proyecto o lista, estado, esfuerzo y descripción. ¿No sabes el formato? Presiona <b>Download CSV template</b>, llénala en Excel o Google Sheets e impórtala.</p>
<p><button class="btn sm" data-do="import">Abrir importar</button></p>`},
  {id: 'search', group: 'more', title: 'Buscar y atajos de teclado', sum: 'Encuentra cualquier cosa rápido.', tags: 'buscar encontrar atajo teclado teclas barra ctrl k',
   body: `<ul>
<li><kbd>/</kbd> o <kbd>Ctrl</kbd>+<kbd>K</kbd>: buscar tareas y proyectos. <kbd>Enter</kbd> abre el primer resultado.</li>
<li><kbd>?</kbd>: abrir esta ayuda.</li>
<li><kbd>Esc</kbd>: cerrar cualquier ventana.</li>
</ul>
<p>En el teléfono, usa la lupa de arriba.</p>
<p><button class="btn sm" data-do="search">Buscar ahora</button></p>`},
  {id: 'install', group: 'app', title: 'Instalar Kairo en tu teléfono o computadora', sum: 'Úsalo como una app normal, con su propio ícono.', tags: 'instalar app pantalla de inicio iphone android pwa escritorio icono',
   body: `<ul>
<li><b>iPhone (Safari):</b> presiona <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>.</li>
<li><b>Android (Chrome):</b> menú ⋮ → <b>Instalar app</b> (o <b>Agregar a la pantalla principal</b>).</li>
<li><b>Computadora (Chrome o Edge):</b> el ícono de instalar a la derecha de la barra de direcciones, o menú → <b>Instalar Kairo</b>.</li>
</ul>
<p>Instalada, abre en su propia ventana, funciona sin internet y aparece en el menú Compartir del teléfono.</p>`},
  {id: 'sync', group: 'app', title: 'Sincronización, sin internet y varios dispositivos', sum: 'Tus datos en todos tus dispositivos, aun sin internet.', tags: 'sincronizar sync sin internet offline dispositivos telefono computadora nube respaldo no sincroniza pendiente',
   body: `<p>Entra con la misma cuenta en cada dispositivo y tus datos se mantienen al día. Kairo guarda primero en tu dispositivo y manda los cambios a la nube en segundo plano, así que <b>funciona sin internet</b>; los cambios suben cuando vuelves a conectarte.</p>
<ul>
<li>El punto al lado de tus iniciales muestra el estado de la sincronización; abre el menú para ver detalles.</li>
<li>¿Falta algo en otro dispositivo? Abre el menú → <b>Sync now</b>.</li>
<li>Volver a abrir la app en pantalla también sincroniza.</li>
</ul>`},
  {id: 'account', group: 'app', title: 'Cuenta, contraseña y comentarios', sum: 'Cambia tu contraseña, cierra sesión o dinos qué mejorar.', tags: 'cuenta contraseña olvide restablecer cerrar sesion salir perfil comentarios error',
   body: `<ul>
<li><b>Cambiar contraseña:</b> tus iniciales → <b>Change password</b>.</li>
<li><b>Si la olvidaste:</b> en la página de entrada presiona <b>Forgot password?</b> y revisa tu email.</li>
<li><b>Cerrar sesión:</b> tus iniciales → <b>Sign out</b>. Hazlo en computadoras compartidas.</li>
<li><b>Comentarios:</b> tus iniciales → <b>Send feedback</b>. Le llega en privado al dueño de la app.</li>
</ul>
<p><button class="btn sm" data-do="feedback">Enviar comentarios</button></p>`}
  ]
}
};
