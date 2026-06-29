// Supabase connection for the read-only frontend.
// The anon key is PUBLIC by design (row-level security allows SELECT only),
// so it is safe to ship in the browser. Never put the service_role key here.
window.SUPABASE_CFG = {
  url: "https://znswnxlwklpunyvgypll.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpuc3dueGx3a2xwdW55dmd5cGxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjI0ODQsImV4cCI6MjA5ODI5ODQ4NH0.71ISvuG4JTIA5p9dytnLAgKDM-HxIta2X2bgPu49sxo",
  table: "predictions_soccer_v1_ourmodel",
};
