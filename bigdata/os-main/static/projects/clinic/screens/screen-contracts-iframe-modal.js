// Render function for Dashboard iframe modal
function renderDashboardIframeModal(appState) {
    var state = appState.data.screens.contracts || {};
    var modal = state.dashboardIframeModal || {};
    if (!modal.open) return null;

    return UI.Modal({
        open: true,
        title: modal.title || 'Dashboard',
        size: 'full',
        closeGkey: 'contracts:close-dashboard-iframe',
        hideFooter: true
    }, [
        D.Div({ attrs: { class: 'w-full h-[80vh]' } }, [
            D.Iframe({
                attrs: {
                    src: modal.url,
                    class: 'w-full h-full border-0',
                    sandbox: 'allow-same-origin allow-scripts allow-forms'
                }
            })
        ])
    ]);
}
