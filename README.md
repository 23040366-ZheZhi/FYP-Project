# Interactive ESG Dashboard

## 1. Project Overview
This project is a **web-based Interactive ESG (Environmental, Social, Governance) Dashboard** designed to visualise sustainability-related data such as **electricity, water, solar energy, and waste metrics**, alongside interactive media and a 3D campus map. The system is built using **Node.js, Express.js, EJS templating**, and standard web technologies, and is intended to be handed over for further development and testing by a future team.

The application supports:
- Public dashboard viewing
- Interactive and non-interactive data visualisations
- Media management (images/videos)
- Admin authentication and management
- A modular UI with reusable navigation components

---

## 2. System Architecture

### 2.1 High-Level Architecture
The system follows a **Model–View–Controller (MVC)-style structure**:

- **Server-side logic**: Node.js + Express.js
- **Views**: EJS templates
- **Static assets**: CSS, images, videos
- **Client-side logic**: JavaScript (charts, interactions)

```
Client (Browser)
   ↓
Express Server (app.js)
   ↓
EJS Views (Dashboard, Graphs, Admin Pages)
   ↓
Static Assets / Media Files
```

---

## 3. Technology Stack

| Layer | Technology |
|------|-----------|
| Backend | Node.js, Express.js |
| Frontend | EJS, HTML5, CSS3, Bootstrap |
| Charts & Visualisation | Chart.js (via EJS pages) |
| 3D Visualisation | `<model-viewer>` (GLB model) |
| Media Handling | HTML5 Video & Image elements |
| Authentication | Custom admin login & verification |

---

## 4. Project Structure

```
project-root/
│
├── app.js                      # Main Express application entry
│
├── views/
│   ├── dashboard.ejs           # Main ESG dashboard
│   ├── login.ejs               # Admin login page
│   ├── verify.ejs              # Login verification page
│   │
│   ├── graphs/
│   │   ├── electgraph.ejs      # Electricity overview graph
│   │   ├── watergraph.ejs      # Water overview graph
│   │   ├── solargraph.ejs      # Solar overview graph
│   │   ├── waste.ejs           # Waste metrics graph
│   │
│   ├── individual/
│   │   ├── indivelect.ejs
│   │   ├── indivwater.ejs
│   │   ├── Indivelect_noninteractive.ejs
│   │   ├── IndivWater_noninteractive.ejs
│   │
│   ├── media/
│   │   ├── media_management.ejs
│   │   ├── addVideo.ejs
│   │   ├── video.ejs
│   │
│   ├── admin/
│   │   ├── admins.ejs
│   │   ├── createAdmin.ejs
│   │   ├── editAdmin.ejs
│   │
│   ├── map/
│   │   └── interactivemap.ejs  # 3D campus map
│   │
│   ├── partials/
│   │   ├── navbar.ejs          # Top navigation bar
│   │   └── bottomnav.ejs       # Bottom navigation bar
│
├── public/
│   ├── stylesheets/
│   ├── images/
│   ├── videos/
│   └── models/
│
└── README.md
```

---

## 5. Core Functional Modules

### 5.1 Dashboard Module
- Acts as the **central landing page** for ESG information
- Displays summary metrics and navigation to detailed views
- Integrates reusable navigation components

### 5.2 Graph & Data Visualisation Module
- Supports **Electricity, Water, Solar, and Waste** data
- Two modes:
  - **Interactive**: User-controlled charts
  - **Non-interactive**: Static data presentation for reporting
- Each ESG metric has both overview and individual breakdown pages

### 5.3 Interactive 3D Map Module
- Uses a GLB 3D model rendered via `<model-viewer>`
- Allows users to visually explore the campus layout
- Prepared for future enhancement (clickable buildings, overlays)

### 5.4 Media Management Module
- Allows admins to manage images and videos
- Supports:
  - Media preview
  - Video carousel display
  - Media ordering and rotation management

### 5.5 Admin & Authentication Module
- Admin login and verification flow
- Admin management features:
  - Create admin
  - Edit admin
  - View admin list
- Access control for management-related pages

---

## 6. Navigation & UI Design

### 6.1 Reusable Partials
- **navbar.ejs**: Top navigation across pages
- **bottomnav.ejs**: Bottom navigation for quick access

### 6.2 Design Principles
- Modular and reusable layout
- Clear separation between public and admin views
- Responsive design using Bootstrap

---

## 7. Application Entry Point (app.js)

- Configures Express server
- Registers routes for:
  - Dashboard
  - Graphs
  - Media management
  - Admin authentication
- Serves static assets
- Connects view engine (EJS)

---

## 8. Security Considerations

- Admin-only access to management pages
- Login verification before sensitive operations
- Server-side routing prevents direct page access without authentication

---

## 9. Deployment Notes

- Designed to run on a standard Node.js environment
- Requires:
  - Node.js (LTS recommended)
  - npm dependencies installed
- Static assets must be correctly served via Express

---

## 10. Limitations & Known Gaps

- Dashboard **has not been fully implemented or tested**
- No automated testing implemented
- Data sources currently static or placeholder-based
- Advanced interactions (e.g., clickable 3D buildings) not implemented

---

## 11. Future Enhancements

- Integration with real-time data sources
- Database-backed ESG metrics
- Role-based access control (RBAC)
- Enhanced 3D map interactions
- Automated testing and logging
- Performance and security hardening

---

## 12. Handover Notes

This project is structured and documented to support **handover to another development team**. The modular design allows individual components (graphs, media, admin, 3D map) to be extended independently without major refactoring.

---

**End of System Documentation**

