document.addEventListener('DOMContentLoaded', async () => {
  if (page() === 'requests') {
    await initRequestsPage();
  } else if (page() === 'dashboard') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    await loadArticles();
    renderArticlesAlerte();
    await loadRequests();
    await loadDashboardCounters();
    renderDashboard();

    // upcoming maintenances UI
    await loadUpcomingMaintenances(30);
    setInterval(() => loadUpcomingMaintenances(30), 5 * 60 * 1000);
    notifyUpcomingMaintenances(7);

  } else if (page() === 'new-request') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    bindNewRequestPage();
  } else if (page() === 'stock') {
    await initStockPage();
  } else if (page() === 'installations') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    await loadInstallations();
    bindInstallationsPage();
  } else if (page() === 'archives') {
    await initArchivesPage();
  }
});
