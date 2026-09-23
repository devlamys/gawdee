(() => {
    'use strict';
    const shell = document.querySelector('[data-checkout]');
    if (!shell) return;

    const cartKey = 'gawdee-modern-cart';
    const checkoutKey = 'gawdee-checkout-token';
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem(cartKey) || '[]'); } catch { cart = []; }
    if (!Array.isArray(cart)) cart = [];
    cart = cart.filter(item => item && typeof item.id === 'string' && Number.isInteger(Number(item.quantity)) && Number(item.quantity)>0);
    let catalogueReady = cart.length === 0;

    const makeToken = () => {
        const bytes = new Uint8Array(18);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    };
    let checkoutToken = makeToken();
    try { checkoutToken = sessionStorage.getItem(checkoutKey) || checkoutToken; sessionStorage.setItem(checkoutKey, checkoutToken); } catch {}

    const q = selector => shell.querySelector(selector);
    const money = amount => new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 0}).format(amount);
    const safeText = value => String(value).replace(/[<>&]/g, '');
    const safeAttribute = value => String(value).replace(/["<>]/g, '');
    const itemsNode = q('[data-checkout-items]');
    const emptyNode = q('[data-checkout-empty]');
    const totalsNode = q('[data-checkout-totals]');
    const submit = q('[data-checkout-submit]');
    const errorNode = q('[data-checkout-error]');
    const couponInput = q('[name="coupon_code"]');
    const couponMessage = q('[data-coupon-message]');
    const activeOffer = String(shell.dataset.offerCode || '').toUpperCase();
    const offerPercent = Math.min(100, Math.max(0, Number(shell.dataset.offerPercent || 0)));
    const freeThreshold = Number(shell.dataset.freeShipping || 999);
    const shippingFee = Number(shell.dataset.shippingFee || 99);
    const hasPaymentMethod = Boolean(q('[name="payment_method"]'));
    let appliedCoupon = '';

    const totals = () => {
        const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
        const shipping = subtotal >= freeThreshold ? 0 : shippingFee;
        const discount = appliedCoupon === activeOffer ? Math.floor(subtotal * offerPercent / 100) : 0;
        return {subtotal, shipping, discount, total: Math.max(0, subtotal - discount + shipping)};
    };

    const render = () => {
        const count = cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
        const amounts = totals();
        q('[data-checkout-count]').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
        itemsNode.innerHTML = cart.map(item => `<article><img src="${safeAttribute(item.image)}" alt=""><div><h3>${safeText(item.name)}</h3><p>Qty ${Number(item.quantity)} × ${money(Number(item.price))}</p></div><strong>${money(Number(item.price) * Number(item.quantity))}</strong></article>`).join('');
        emptyNode.hidden = cart.length > 0;
        totalsNode.hidden = cart.length === 0;
        submit.disabled = !catalogueReady || cart.length === 0 || !hasPaymentMethod;
        q('[data-checkout-subtotal]').textContent = money(amounts.subtotal);
        q('[data-checkout-shipping]').textContent = amounts.shipping ? money(amounts.shipping) : 'Free';
        q('[data-checkout-total]').textContent = money(amounts.total);
        const discountRow = q('[data-checkout-discount-row]');
        discountRow.hidden = amounts.discount === 0;
        q('[data-checkout-discount]').textContent = `−${money(amounts.discount)}`;
        q('[data-checkout-delivery-note]').textContent = amounts.subtotal >= freeThreshold ? 'You unlocked free delivery.' : `Free delivery above ${money(freeThreshold)}.`;
    };

    const showError = message => {
        errorNode.textContent = message;
        errorNode.hidden = false;
        errorNode.scrollIntoView({behavior: 'smooth', block: 'center'});
    };
    const setBusy = busy => {
        submit.disabled = busy || !catalogueReady || cart.length === 0 || !hasPaymentMethod;
        submit.classList.toggle('is-loading', busy);
        submit.querySelector('span').textContent = busy ? 'Preparing secure checkout…' : 'Place secure order';
    };
    const resetCheckoutToken = () => {
        checkoutToken = makeToken();
        try { sessionStorage.setItem(checkoutKey, checkoutToken); } catch {}
    };

    q('[data-apply-coupon]')?.addEventListener('click', () => {
        const candidate = String(couponInput?.value || '').trim().toUpperCase();
        if (candidate === activeOffer && activeOffer !== '') {
            appliedCoupon = candidate;
            couponInput.value = candidate;
            couponMessage.textContent = `${offerPercent}% offer applied successfully.`;
            couponMessage.classList.add('is-success');
        } else {
            appliedCoupon = '';
            couponMessage.textContent = candidate ? 'This offer code is not valid.' : `Enter ${activeOffer} to apply the offer.`;
            couponMessage.classList.remove('is-success');
        }
        render();
    });

    q('[data-checkout-form]').addEventListener('submit', async event => {
        event.preventDefault();
        errorNode.hidden = true;
        if (!catalogueReady || !cart.length || !hasPaymentMethod) return;
        setBusy(true);
        const form = new FormData(event.currentTarget);
        const customer = Object.fromEntries(form.entries());
        const paymentMethod = customer.payment_method;
        const couponCode = String(customer.coupon_code || '').trim().toUpperCase();
        delete customer.payment_method;
        delete customer.coupon_code;
        try {
            const response = await fetch('api/create-order.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    csrf_token: shell.dataset.csrf,
                    checkout_token: checkoutToken,
                    coupon_code: couponCode,
                    customer,
                    payment_method: paymentMethod,
                    items: cart.map(({id, quantity}) => ({id, quantity}))
                })
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                if (result.reset_checkout) resetCheckoutToken();
                throw new Error(result.message || 'Unable to create the order.');
            }
            if (result.already_paid) {
                localStorage.removeItem(cartKey);
                sessionStorage.removeItem(checkoutKey);
                window.location.href = result.success_url;
                return;
            }
            if (result.payment_method === 'cod') {
                localStorage.removeItem(cartKey);
                sessionStorage.removeItem(checkoutKey);
                window.location.href = result.success_url;
                return;
            }
            if (!window.Razorpay) throw new Error('Razorpay Checkout could not load. Your order is saved; reload this page to continue payment.');
            const options = {
                ...result.razorpay,
                theme: {color: '#087345'},
                modal: {ondismiss: () => setBusy(false)},
                handler: async payment => {
                    try {
                        const verifyResponse = await fetch('api/verify-payment.php', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({csrf_token: shell.dataset.csrf, order_number: result.order_number, ...payment})
                        });
                        const verified = await verifyResponse.json();
                        if (!verifyResponse.ok || !verified.ok) throw new Error(verified.message || 'Payment verification failed.');
                        localStorage.removeItem(cartKey);
                        sessionStorage.removeItem(checkoutKey);
                        window.location.href = verified.success_url;
                    } catch (error) {
                        showError(error.message);
                        setBusy(false);
                    }
                }
            };
            new Razorpay(options).open();
        } catch (error) {
            showError(error.message || 'Something went wrong.');
            setBusy(false);
        }
    });

    render();
    if (cart.length) {
        submit.querySelector('span').textContent = 'Checking prices & availability…';
        fetch('api/catalog.php', {credentials:'same-origin',cache:'no-store'})
            .then(async response => { if(!response.ok) throw new Error('Could not check availability. Reload this page to try again.'); return response.json(); })
            .then(result => {
                if(!result.ok || !Array.isArray(result.products)) throw new Error('Could not refresh your bag. Please reload.');
                const catalogue = new Map(result.products.map(product => [product.id,product]));
                cart = cart.flatMap(item => {
                    const current = catalogue.get(item.id);
                    return current && current.stock > 0 ? [{id:current.id,name:current.name,image:current.image,price:current.price,quantity:Math.min(10,current.stock,Number(item.quantity))}] : [];
                });
                try { localStorage.setItem(cartKey,JSON.stringify(cart)); } catch {}
                catalogueReady = true;
                render();
                submit.querySelector('span').textContent = 'Place secure order';
            }).catch(error => { showError(error.message); submit.querySelector('span').textContent = 'Reload to check availability'; });
    }
})();
