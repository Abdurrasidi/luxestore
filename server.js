const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

// DATA MASTER PRODUK
let products = [
    { id: 1, title: "Lumina T1 Camera", price: 1299, category: "Tech Essentials", stock: 8, badge: "FEATURED", badgeColor: "bg-brand text-white", desc: "Kamera mirrorless premium dengan bodi serat karbon presisi tinggi.", image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600" },
    { id: 2, title: "Cognac Portfolio", price: 650, category: "Accessories", stock: 12, badge: "READY TO SHIP", badgeColor: "bg-gray-100 text-stitch-muted", desc: "Tas dokumen berbahan kulit asli olahan tangan artisan Italia.", image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600" },
    { id: 3, title: "Apex Mech X Keyboard", price: 280, category: "Tech Essentials", stock: 2, badge: "STOK TERBATAS", badgeColor: "bg-red-50 text-red-600", desc: "Keyboard mekanikal nirkabel bodi aluminium kustom.", image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600" }
];

// DATA MASTER PESANAN (Dibutuhkan untuk tab Pesanan Masuk di Admin)
let orders = [];

io.on('connection', (socket) => {
    console.log(`[LOG] Client Terhubung: ${socket.id}`);

    // KONEKSI AWAL: Kirim data berbeda sesuai kebutuhan frontend
    socket.emit('init:products', products); // Untuk index.html (Pembeli)
    socket.emit('init:data', { products, orders }); // Untuk admin.html (Merchant Central)

    // MENERIMA PESANAN BARU DARI PEMBELI
    socket.on('client:new-order', (orderData) => {
        // 1. Buat Data Pesanan Baru
        const newOrder = {
            id: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
            customer: orderData.customer || "Pelanggan Guest",
            phone: orderData.phone || "-",
            total: orderData.total || 0,
            status: 'MENUNGGU DIPROSES',
            createdAt: new Date().toISOString()
        };
        
        orders.unshift(newOrder); // Masukkan ke urutan teratas

        // 2. Kurangi Stok Produk Terkait
        orderData.cart.forEach(item => {
            const target = products.find(p => p.id === item.id);
            if (target) {
                target.stock -= item.qty;
                if (target.stock < 0) target.stock = 0;
                
                // Update tabel produk Admin secara spesifik per produk
                io.emit('realtime:product-updated', target);
            }
        });

        // 3. Beri tahu seluruh sistem
        io.emit('realtime:stock-updated', products); // Update katalog pembeli lain
        io.emit('realtime:new-order-received', newOrder); // Munculkan notifikasi & pesanan di layar Admin
    });

    // FALLBACK: Menerima event lama jika index.html belum di-update
    socket.on('client:reduce-stock', (cartItems) => {
        cartItems.forEach(item => {
            const target = products.find(p => p.id === item.id);
            if (target) {
                target.stock -= item.qty;
                if (target.stock < 0) target.stock = 0;
                io.emit('realtime:product-updated', target);
            }
        });
        io.emit('realtime:stock-updated', products);
    });

    // EVENT ADMIN: TAMBAH PRODUK
    socket.on('admin:add-product', (data) => {
        const newP = { id: Date.now(), ...data };
        products.push(newP);
        io.emit('realtime:product-added', newP); // Update UI Admin
        io.emit('realtime:stock-updated', products); // Update UI Pembeli
    });

    // EVENT ADMIN: EDIT PRODUK
    socket.on('admin:edit-product', (data) => {
        const idx = products.findIndex(p => p.id === data.id);
        if (idx !== -1) {
            products[idx] = { ...products[idx], ...data };
            io.emit('realtime:product-updated', products[idx]); // Update UI Admin
            io.emit('realtime:stock-updated', products); // Update UI Pembeli
        }
    });

    // EVENT ADMIN: HAPUS PRODUK
    socket.on('admin:delete-product', (id) => {
        products = products.filter(p => p.id !== id);
        io.emit('realtime:product-deleted', id); // Update UI Admin
        io.emit('realtime:stock-updated', products); // Update UI Pembeli
    });

    // EVENT ADMIN: UPDATE STATUS PESANAN (Menunggu -> Selesai, dll)
    socket.on('admin:update-order-status', ({ orderId, newStatus }) => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
            order.status = newStatus;
            io.emit('realtime:order-status-updated', { orderId, newStatus }); // Update tabel pesanan
            io.emit('init:data', { products, orders }); // Paksa hitung ulang statistik pendapatan
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server LuxeStore Berjalan di http://localhost:${PORT}`);
});