# Table Order Admin Panel Setup

## Critical Setup Steps

### 1. Run the Final SQL Migration

After running `schema.sql` and `admin_panel_migration.sql`, run:

```sql
-- Run: supabase/FINAL_ADMIN_AND_PRODUCTION_PATCH.sql
```

This ensures all admin functions are properly configured.

### 2. Set the Admin Security Key (CRITICAL)

The admin panel requires a secure admin key. This is different from restaurant PINs.

**DO NOT leave the default key unchanged.**

In your Supabase dashboard:

1. Go to SQL Editor
2. Run this command with YOUR chosen secure key:

```sql
UPDATE app_settings SET value = 'YOUR-LONG-SECURE-ADMIN-KEY-HERE' 
WHERE key = 'admin_key';
```

**Requirements for Admin Key:**
- At least 8 characters (enforced by code)
- Should be very long and random (e.g., 32+ characters)
- Example: `admin_mfr8J9x2kLpQwE6tH3vN7sD4uA1zB0Y`

**IMPORTANT SECURITY NOTES:**
- ✅ Admin key is NOT stored in frontend code
- ✅ Admin key is NOT included in QR codes
- ✅ Admin key is NOT shown to restaurant staff
- ✅ Admin key is NOT logged in console
- ✅ Admin key is only compared server-side in Supabase RPCs
- ✅ Admin key is protected by RLS policies (no frontend read access)

### 3. Access the Admin Panel

1. Navigate to: `https://your-domain.com/admin`
2. Enter your Admin Security Key (set in step 2)
3. You should see the admin dashboard with tabs:
   - Overview: Summary statistics
   - Restaurants: Manage plans and view all restaurants
   - Activation Codes: Create and manage activation codes
   - Reports: Generate PDF reports

## Admin Panel Features

### Overview Tab
- View total restaurants
- Quick stats: On Trial, Overdue, Sold Out

### Restaurants Tab
- Update restaurant plans
- Change plan status (trial, active, complimentary, sold out)
- Extend plans
- View all restaurants with their stats
- Generate PDF reports for individual restaurants

### Activation Codes Tab
- Generate new activation codes
- View all codes (used/unused)
- Track which restaurant used each code

### Reports Tab
- Download restaurant list as PDF
- Download admin summary PDF
- Reports include NO sensitive credentials (no PINs, no keys)

## Database Structure

### app_settings
Stores admin configuration:
- `admin_key`: The admin security key

### activation_codes
Tracks activation codes:
- `code`: The code text
- `is_used`: Whether it's been used
- `used_by`: Restaurant ID that used it
- `created_at`: When the code was generated

### restaurant_plans
Stores subscription information:
- `restaurant_id`: Unique ID
- `plan_status`: trial, active, overdue, sold_out, complimentary
- `trial_ends_at`: When trial expires
- `paid_until`: When current plan expires
- `grace_ends_at`: Grace period deadline (10 days after expiry)
- `billing_cycle`: month or year
- `session_count`: Number of shifts/sessions
- `order_count`: Total orders
- `lifetime_revenue`: Total revenue

## Important Rules

### ✅ DO:
- Use a strong, random admin key
- Regularly review the Activation Codes tab
- Check Reports for business insights
- Monitor restaurant plans and expiry dates
- Use PDFs for record-keeping

### ❌ DON'T:
- Share the admin key in code repositories
- Display admin key in browser console
- Put admin key in QR codes or URLs
- Email the admin key in plain text
- Use the same admin key across different environments

## Troubleshooting

### "ADMIN_NOT_CONFIGURED" Error
- The admin key hasn't been set in `app_settings`
- Run the SQL command from step 2 above

### "ADMIN_UNAUTHORIZED" Error
- The entered admin key doesn't match the one in `app_settings`
- Double-check your key for typos
- Case-sensitive!

### Functions Not Found Error
- Make sure `FINAL_ADMIN_AND_PRODUCTION_PATCH.sql` has been run
- Check that all migrations were executed in order:
  1. schema.sql
  2. admin_panel_migration.sql
  3. FINAL_ADMIN_AND_PRODUCTION_PATCH.sql

### PDF Download Not Working
- Check browser console for errors
- Ensure jsPDF is properly bundled
- Browser pop-up blockers may prevent downloads

## API Functions Reference

### admin_list_restaurants(p_admin_key)
Returns all restaurants with their plan and activity data.

### admin_update_plan(p_admin_key, p_restaurant_id, p_action, p_days, p_billing_cycle)
Updates a restaurant's plan. Actions:
- `mark_paid`: Mark plan as paid for N days
- `extend_trial`: Extend trial for N days
- `complimentary`: Make plan complimentary
- `sold_out`: Mark as sold out
- `set_notes`: Set notes (requires p_notes parameter)

### admin_list_codes(p_admin_key)
Returns all activation codes and their usage status.

### admin_create_codes(p_admin_key, p_codes)
Creates new activation codes. Pass array of code strings.

### admin_delete_code(p_admin_key, p_code)
Deletes an activation code.

## Security Architecture

```
User Login
    ↓
Admin enters key (sessionStorage only, never localStorage)
    ↓
Browser calls admin_list_restaurants(key)
    ↓
Supabase RPC (SECURITY DEFINER)
    ↓
_admin_assert(key) - compares with app_settings.value
    ↓
If valid: return data
If invalid: ADMIN_UNAUTHORIZED error
```

The key is never exposed:
- ✅ Validated server-side
- ✅ Not returned to browser (except for session management)
- ✅ Protected by RLS
- ✅ Compared in SECURITY DEFINER function
- ✅ Never visible in network tabs (passed in RPC params)

## Updating the Admin Key

If you need to change the admin key:

```sql
UPDATE app_settings 
SET value = 'NEW-SECURE-KEY-HERE', updated_at = now() 
WHERE key = 'admin_key';
```

All currently logged-in admin sessions will need to re-enter the new key.

## Backup & Recovery

Always maintain backups of:
1. The `admin_key` value (stored securely, NOT in code)
2. The `app_settings` table
3. The `activation_codes` table
4. The `restaurant_plans` table

Restaurant data is NEVER deleted. Even if a plan expires, all orders, menu items, and historical data remain.
