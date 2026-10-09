# CounterDashboard.jsx — Required Changes

Open `src/pages/CounterDashboard.jsx` and make these **3 small edits**.

---

## 1. Add import (near the top, with other component imports)

Find this block:

```js
import BillingPanel from '../components/BillingPanel.jsx'
import PrintableTicket from '../components/PrintableTicket.jsx'
```

Add this line after it:

```js
import CostingCenter from '../components/CostingCenter.jsx'
```

---

## 2. Add "Costing" tab button

Find the tab buttons section that looks like:

```jsx
<button
  onClick={() => setTab('orders')}
  style={tabStyle(tab === 'orders')}
>
  Orders
</button>
<button
  onClick={() => setTab('menu')}
  style={tabStyle(tab === 'menu')}
>
  Menu Editor
</button>
```

Add this button right after "Menu Editor":

```jsx
<button
  onClick={() => setTab('costing')}
  style={tabStyle(tab === 'costing')}
>
  Costing
</button>
```

---

## 3. Add render branch for Costing tab

Find this pattern:

```jsx
{tab === 'menu' ? (

  <MenuEditor
    sessionId={session.id}
  />

) : tab === 'qr' ? (
```

Change it to:

```jsx
{tab === 'menu' ? (

  <MenuEditor
    sessionId={session.id}
  />

) : tab === 'costing' ? (

  <CostingCenter
    sessionId={session.id}
  />

) : tab === 'qr' ? (
```

---

That's all. Save, commit, push. New **Costing** tab will appear in Counter Dashboard.
