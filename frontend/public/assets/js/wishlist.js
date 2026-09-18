(() => {
    'use strict';
    let saved = {};
    const buttons = [...document.querySelectorAll('[data-wishlist]')];
    const idsFor = button => (button.dataset.productIds || button.dataset.productId || '').split(',').filter(Boolean).sort();
    const message = text => {
        const toast = document.querySelector('[data-toast]');
        if (!toast) return;
        toast.textContent = text; toast.classList.add('is-visible');
        window.setTimeout(() => toast.classList.remove('is-visible'), 3500);
    };
    const render = () => {
        buttons.forEach(button => {
            const active = Boolean(saved[idsFor(button).join(',')]);
            button.classList.toggle('is-saved',active);
            button.setAttribute('aria-pressed',String(active));
            button.querySelector('i')?.classList.toggle('ph-fill',active);
        });
        document.querySelectorAll('[data-wishlist-count]').forEach(counter => counter.textContent = String(Object.keys(saved).length));
        document.querySelectorAll('[data-saved-group]').forEach(group => group.hidden = !saved[group.dataset.savedGroup]);
        const empty = document.querySelector('[data-wishlist-empty]');
        if (empty) empty.hidden = Object.keys(saved).length > 0;
    };
    const request = async payload => {
        const response = await fetch('api/wishlist.php', payload ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,csrf_token:document.querySelector('meta[name="gawdee-csrf"]')?.content || ''})} : {cache:'no-store'});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || 'Could not load your wishlist.');
        saved = result.items || {}; render();
    };
    const ready = request().catch(() => { message('Your wishlist could not be loaded. Refresh to try again.'); throw new Error('Wishlist unavailable'); });
    // Handle initial errors without generating an unhandled promise rejection.
    ready.catch(() => {});
    buttons.forEach(button => button.addEventListener('click',async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
            await ready;
            const ids = idsFor(button); const next = !saved[ids.join(',')];
            await request({ids,saved:next});
            message(next ? 'Saved to your wishlist' : 'Removed from your wishlist');
        } catch (error) { message(error.message || 'Could not update your wishlist.'); }
        finally { button.disabled = false; }
    }));
})();
