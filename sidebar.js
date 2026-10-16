(function () {
  const sidebarPages = [
    { label: 'Tableau de bord', href: 'dashboard.html' },
    { label: 'Installations', href: 'installations.html' },
    { label: 'Nouvelle intervention', href: 'new-request.html' },
    { label: 'Demandes', href: 'requests.html' },
    { label: 'Stock', href: 'stock.html' },
    { label: 'Archives', href: 'archives.html' }
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
    const sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.id = 'appSidebar';

    // build links with a more robust active detection (handles query strings)
    const links = sidebarPages.map((page) => {
      const isActive = window.location.pathname.endsWith('/' + page.href) || window.location.pathname === '/' && page.href === 'dashboard.html' || currentPage() === page.href;
      const activeClass = isActive ? 'active' : '';
      return `<a class="sidebar-link ${activeClass}" href="${page.href}"><span>${page.label}</span></a>`;
    }).join('');

    sidebar.innerHTML = `
      <div class="sidebar-header">
        <button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Basculer le menu">☰</button>
        <div class="sidebar-brand">
          <div class="sidebar-logo">M</div>
          <span>Maintenance</span>
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

    // find main page wrapper to position into the grid
    const pageWrapper = document.querySelector('main') || document.querySelector('.container') || document.body;

    // ensure wrapper gets class to be placed in the second column
    pageWrapper.classList.add('page-with-sidebar');

    const toggle = document.getElementById('sidebarToggle');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    const hideOnMobile = window.matchMedia('(max-width: 900px)');

    // create mobile open button and overlay
    createMobileControls();

    // restore saved collapsed state
    const savedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (savedCollapsed === 'true') {
      sidebar.classList.add('collapsed');
      pageWrapper.classList.add('sidebar-collapsed');
      document.body.classList.add('sidebar-enabled');
      document.body.classList.add('sidebar-collapsed');
    }

    // restore saved hidden state
    const savedHidden = localStorage.getItem('sidebar-hidden');
    if (savedHidden === 'true' && !hideOnMobile.matches) {
      document.body.classList.add('sidebar-hidden');
      // apply grid change by adding class; the CSS grid handles the width
      document.body.classList.add('sidebar-enabled');
    }

    toggle.addEventListener('click', () => {
      // On mobile: open drawer
      if (hideOnMobile.matches) {
        openSidebarMobile();
        return;
      }

      // Desktop collapse/expand: toggle collapsed state
      const collapsed = sidebar.classList.toggle('collapsed');
      if (collapsed) {
        pageWrapper.classList.add('sidebar-collapsed');
        document.body.classList.add('sidebar-collapsed');
      } else {
        pageWrapper.classList.remove('sidebar-collapsed');
        document.body.classList.remove('sidebar-collapsed');
      }
      document.body.classList.add('sidebar-enabled');
      localStorage.setItem('sidebar-collapsed', collapsed ? 'true' : 'false');
    });

    // Close button for mobile drawer
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // if mobile, close drawer; otherwise do nothing (it's hidden on desktop)
        if (hideOnMobile.matches) closeSidebarMobile();
      });
    }

    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener('click', callLogout);
    }

    // close drawer when clicking a link on mobile
    sidebar.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        if (window.matchMedia('(max-width: 900px)').matches) {
          // hide drawer but allow navigation
          closeSidebarMobile();
        }
      });
    });

    if (hideOnMobile.matches) {
      sidebar.classList.remove('open'); // ensure closed initially
    }
  }

  // mobile controls: button + overlay
  function createMobileControls() {
    if (document.getElementById('mobileSidebarOpenBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'mobileSidebarOpenBtn';
    btn.className = 'mobile-menu-button';
    btn.setAttribute('aria-label', 'Ouvrir le menu');
    btn.innerHTML = '☰';

    document.body.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    btn.addEventListener('click', openSidebarMobile);
    overlay.addEventListener('click', closeSidebarMobile);

    // close on ESC
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
    // prevent body scroll while drawer is open
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
    const hasTopbar = document.querySelector('.topbar') !== null || document.querySelector('.menu') !== null;
    if (!hasTopbar) return;

    document.body.classList.add('sidebar-enabled');
    if (!document.getElementById('appSidebar')) {
      buildSidebar();
    }
  });
})();
