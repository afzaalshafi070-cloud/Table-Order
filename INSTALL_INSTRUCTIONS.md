# Table Order — Costing & Inventory Update
## Install Instructions (GitHub + Supabase)

---

## What this package adds

| Feature | Description |
|---------|-------------|
| **Raw Materials** | Stock + weighted average cost + purchase logging |
| **Recipe Builder** | Link ingredients to each dish with quantities |
| **Overheads** | Monthly fixed costs → per-plate share |
| **Profit Dashboard** | Net profit, margin %, status (Healthy / Low / Loss) |
| **Waste / Theft Detector** | Theoretical vs actual usage comparison |
| **Auto stock deduction** | When order status → Served / Completed |

**No extra paid API required** for these features.

---

## STEP 1 — Supabase SQL (do this first)

1. Open your Supabase project → **SQL Editor**
2. Create a new query
3. Copy the entire contents of:
   ```
   supabase/COSTING_AND_INVENTORY_MIGRATION.sql
   ```
4. Run it
5. Confirm success (no red errors)
6. Optional check: Table Editor me ye tables dikhne chahiye:
   - `raw_materials`
   - `recipes`
   - `overheads`
   - `inventory_log`
   - `daily_profit_snapshots`

---

## STEP 2 — Frontend files (GitHub)

### A. Copy new files into your repo

Copy these files **exactly** as-is into your project:

```
src/components/CostingCenter.jsx
src/components/RawMaterials.jsx
src/components/RecipeBuilder.jsx
src/components/OverheadsManager.jsx
src/components/ProfitDashboard.jsx
src/components/WasteAlerts.jsx
```

(Folder structure same rakho — `src/components/` ke andar)

### B. Patch CounterDashboard.jsx

Open `src/pages/CounterDashboard.jsx` and apply the 3 changes described in:

```
COUNTER_DASHBOARD_PATCH.md
```

(Summary: 1 import + 1 tab button + 1 render branch)

### C. Commit & Push

```bash
git add .
git commit -m "feat: dish-level costing, inventory, waste detection"
git push
```

Vercel / Netlify will auto-deploy.

---

## STEP 3 — First-time owner setup (inside the app)

After deploy, restaurant owner ko ye order follow karna hai:

1. **Counter Dashboard** → **Costing** tab
2. **Raw Materials** → Rice, Ghee, Chicken, Spices etc. add karo (opening stock + cost)
3. **Recipes** → Har dish select karke ingredients + quantity set karo
4. **Overheads** → Staff salary, Rent, Gas, Electricity (monthly) + expected plates
5. **Profit** tab → Net profit / margin dekho
6. Orders ko **Served / Completed** mark karo → stock auto deduct hoga
7. **Waste / Theft** tab → leakage check karo

---

## Notes

- Stock deduction **sirf** tab hota hai jab order status `served` ya `completed` banta hai (trigger se).
- Agar pehle se bohot orders hain, purane orders pe stock deduct nahi hoga (sirf future).
- `record_purchase` RPC se purchase karo — weighted average cost auto update hota hai.
- WhatsApp EOD is package me **nahi** hai (uske liye alag API chahiye). Baad me add kar sakte ho.

---

## Rollback (agar zarurat pade)

SQL tables drop karne ke liye (caution — data delete):

```sql
drop table if exists daily_profit_snapshots cascade;
drop table if exists inventory_log cascade;
drop table if exists recipes cascade;
drop table if exists overheads cascade;
drop table if exists raw_materials cascade;
-- functions optional drop
```

Frontend: Costing files delete + CounterDashboard changes revert.

---

## Support checklist if something fails

| Problem | Check |
|---------|-------|
| Tables not found | SQL migration run hui? |
| "Not authorized" | Staff login hai? `is_staff_for_session` working? |
| Stock not deducting | Order status really `served`/`completed`? Recipes set? |
| COGS = 0 | Recipe me ingredients + raw material cost set? |
| UI tab missing | CounterDashboard patch correctly applied? |
