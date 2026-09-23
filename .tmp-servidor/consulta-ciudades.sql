\pset pager off
SELECT coalesce(city, '(sin ciudad)') AS ciudad, count(*) AS posts
  FROM lifebook.posts
 WHERE state = 'active' AND visibility = 'public'
 GROUP BY 1
 ORDER BY 2 DESC;

SELECT count(*) AS posts_video FROM lifebook.posts
 WHERE state = 'active' AND visibility = 'public' AND type = 'video';

SELECT full_name, city FROM mobility.users WHERE role = 'ADMIN' OR phone IN ('+240999888777', '+240222000123', '+240555000003');
