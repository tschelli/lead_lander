-- Check Super Admin Setup
-- Run this to diagnose and fix your super admin user

-- 1. Check if your user exists
SELECT id, email, client_id, is_active
FROM users
WHERE email = 'YOUR_EMAIL_HERE';

-- 2. Check user roles
SELECT ur.user_id, ur.role, ur.school_id, u.email
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
WHERE u.email = 'YOUR_EMAIL_HERE';

-- 3. Add super_admin role if missing (replace YOUR_USER_ID)
-- INSERT INTO user_roles (user_id, role, school_id)
-- VALUES ('YOUR_USER_ID', 'super_admin', NULL)
-- ON CONFLICT DO NOTHING;

-- 4. Ensure user is active
-- UPDATE users SET is_active = true WHERE email = 'YOUR_EMAIL_HERE';

-- 5. Check all super admins in the system
SELECT u.id, u.email, u.client_id, ur.role
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role = 'super_admin';
