(function () {
  const sidebarPages = [
    { label: 'Tableau de bord', href: 'dashboard.html', icon: '🏠' },
    { label: 'Installations', href: 'installations.html', icon: '🏢' },
    { label: 'Nouvelle intervention', href: 'new-request.html', icon: '✚' },
    { label: 'Demandes', href: 'requests.html', icon: '📋' },
    { label: 'Stock', href: 'stock.html', icon: '📦' },
    { label: 'Archives', href: 'archives.html', icon: '🗂️' }
  ];

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'dashboard.html';
  }

  function callLogout() {
    if (typeof logout === 'function') {
      logout();
      return;
    }
    if (window.supabaseClient && window.supabaseClient.auth) {
      window.supabaseClient.auth.signOut().then(() => {
        window.location.href = 'index.html';
      });
      return;
    }
    window.location.href = 'index.html';
  }

  function buildSidebar() {
    const activePage = currentPage();
    const pageWrapper = document.querySelector('main') || document.querySelector('.container') || document.body;

    pageWrapper.classList.add('page-with-sidebar');
    document.body.classList.add('sidebar-enabled');

    const sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.id = 'appSidebar';

    const links = sidebarPages.map((page) => {
      const isActive = activePage === page.href || (activePage === '' && page.href === 'dashboard.html');
      return `
        <a class="sidebar-link ${isActive ? 'active' : ''}" href="${page.href}" aria-label="${page.label}">
          <span class="sidebar-link-icon" aria-hidden="true">${page.icon}</span>
          <span class="sidebar-link-text">${page.label}</span>
        </a>
      `;
    }).join('');

    sidebar.innerHTML = `
      <div class="sidebar-header">
        <button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Basculer le menu">☰</button>
        <div class="sidebar-brand">
          <div class="sidebar-logo">GM</div>
          <span>Gestion Maintenance</span>
        </div>
        <button type="button" class="sidebar-close" id="sidebarCloseBtn" aria-label="Fermer le menu">×</button>
      </div>
      <nav class="sidebar-nav" aria-label="Navigation principale">
        ${links}
      </nav>
      <div class="sidebar-footer">
        <button type="button" class="sidebar-logout" id="sidebarLogoutBtn">Déconnexion</button>
      </div>
    `;

    document.body.insertBefore(sidebar, document.body.firstChild);

    const toggle = document.getElementById('sidebarToggle');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    const hideOnMobile = window.matchMedia('(max-width: 900px)');

    const savedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (savedCollapsed === 'true') {
      sidebar.classList.add('collapsed');
      pageWrapper.classList.add('sidebar-collapsed');
      document.body.classList.add('sidebar-collapsed');
    }

    toggle.addEventListener('click', () => {
      if (hideOnMobile.matches) {
        openSidebarMobile();
        return;
      }

      const collapsed = sidebar.classList.toggle('collapsed');
      pageWrapper.classList.toggle('sidebar-collapsed', collapsed);
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      localStorage.setItem('sidebar-collapsed', collapsed ? 'true' : 'false');
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (hideOnMobile.matches) closeSidebarMobile();
      });
    }

    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener('click', callLogout);
    }

    sidebar.querySelectorAll('.sidebar-link').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 900px)').matches) {
          closeSidebarMobile();
        }
      });
    });

    createMobileControls();
  }

  function createMobileControls() {
    if (document.getElementById('mobileSidebarOpenBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'mobileSidebarOpenBtn';
    btn.className = 'mobile-menu-button';
    btn.innerHTML = '☰';
    document.body.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    btn.addEventListener('click', openSidebarMobile);
    overlay.addEventListener('click', closeSidebarMobile);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebarMobile();
    });
  }

  function openSidebarMobile() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    document.body.classList.add('sidebar-enabled');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebarMobile() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function shouldInitSidebar() {
    const page = currentPage();
    return page !== 'index.html' && page !== '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!shouldInitSidebar()) return;

    const hasNativeNavigation = document.querySelector('.topbar') !== null || document.querySelector('.menu') !== null;
    if (hasNativeNavigation) return;

    if (!document.getElementById('appSidebar')) {
      buildSidebar();
    }
  });
})();
