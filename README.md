# Interactive ESG Dashboard – System Documentation

## 1. Introduction
The Interactive ESG Dashboard is a web-based system developed to support the visualisation and presentation of Environmental, Social, and Governance (ESG) information. The system focuses primarily on environmental indicators, including electricity consumption, water usage, solar energy generation, and waste-related data. In addition, the platform integrates multimedia content and a 3D campus map to enhance user engagement and contextual understanding.

This document serves as the **official system documentation** for the project. It describes the system architecture, major components, technologies used, functional modules, and known limitations. The documentation is intended to support system understanding, maintenance, and future enhancement by subsequent development teams.

---

## 2. System Objectives
The main objectives of the system are as follows:
- To provide a centralised dashboard for viewing ESG-related information
- To present sustainability data using clear and structured visualisations
- To support both interactive and non-interactive data views for different use cases
- To allow administrators to manage media and system content
- To provide a foundation that can be extended with real-time data and additional features

---

## 3. System Architecture

### 3.1 Architectural Overview
The system adopts a server-rendered web architecture using Node.js and Express. Dynamic pages are generated using EJS templates, while static resources such as stylesheets, images, videos, and 3D models are served directly by the server.

The architecture can be summarised as follows:

```
User (Web Browser)
   ↓
Express Application (Node.js)
   ↓
EJS View Templates
   ↓
Static Assets and Media Resources
```

This approach was selected to keep the system modular and maintainable

---

## 4. Technology Stack

The technologies used in the development of this system are outlined below:

| Layer | Technology |
|------|-----------|
| Backend | Node.js, Express.js |
| View Engine | EJS (Embedded JavaScript Templates) |
| Frontend | HTML5, CSS3, Bootstrap |
| Data Visualisation | Chart.js |
| 3D Visualisation | `<model-viewer>` with GLB models |
| Media Support | HTML5 Image and Video Elements |
| Authentication | Custom admin login and verification flow |

---

## 5. Project Structure

The project follows a clear and modular directory structure:

```
project-root/
│
├── app.js                      # Main application entry point
│
├── views/                      # EJS templates
│   ├── dashboard.ejs           # Main ESG dashboard
│   ├── login.ejs               # Admin login page
│   ├── verify.ejs              # Login verification page
│   │
│   ├── graphs/                 # ESG overview graphs
│   ├── individual/             # Individual and non-interactive views
│   ├── media/                  # Media management pages
│   ├── admin/                  # Admin management pages
│   ├── map/                    # Interactive 3D map
│   └── partials/               # Reusable UI components
│
├── public/                     # Static assets
│   ├── stylesheets/
│   ├── images/
│   ├── videos/
│   └── models/
│
└── README.md                   # System documentation
```

---

## 6. Functional Modules

### 6.1 Dashboard Module
The dashboard acts as the primary entry point for users. It provides high-level access to ESG data, graphs, media content, and the interactive 3D map. Navigation components are reused across pages to maintain a consistent user experience.

### 6.2 ESG Data Visualisation Module
This module presents ESG data across multiple categories:
- Electricity
- Water
- Solar Energy
- Waste

Each category includes overview graphs, with selected datasets also offering non-interactive versions for static presentation or reporting purposes.

### 6.3 Interactive 3D Map Module
The system includes a 3D campus map rendered using a GLB model and `<model-viewer>`. Users can rotate and zoom the model to explore the environment. The module is designed to be extensible, allowing future implementation of clickable buildings or data overlays.

### 6.4 Media Management Module
The media management module allows administrators to manage visual content within the system. Key functions include:
- Uploading and previewing images and videos
- Displaying videos in a carousel format
- Managing media ordering and rotation

### 6.5 Admin and Authentication Module
Administrative functionality is protected through a login and verification process. Administrators are able to:
- Access restricted management pages
- Create and edit administrator accounts
- Manage system-related content

---

## 7. Application Entry Point

The `app.js` file serves as the main entry point of the application. Its responsibilities include:
- Initialising the Express server
- Configuring middleware and view engine settings
- Defining routes for dashboard, graphs, media, and admin functions
- Serving static files from the public directory

---

## 8. Security Considerations

The system implements basic security measures appropriate for its scope:
- Restricted access to administrative pages
- Login verification prior to sensitive operations
- Server-side routing to prevent unauthorised page access

Further security enhancements are recommended for future development.

---

## 9. Deployment Requirements

To deploy and run the system, the following are required:
- Node.js (Long-Term Support version recommended)
- npm for dependency management
- A compatible web browser for client access

The system is designed to run in a standard Node.js hosting environment.

---

## 10. Limitations

The following limitations were identified at the time of documentation:
- The dashboard has not been fully implemented or tested
- ESG data is currently static or placeholder-based
- No automated testing framework has been implemented
- Advanced 3D map interactions are not available

---

## 11. Future Enhancements

Potential areas for future improvement include:
- Integration with live or real-time data sources
- Database-backed storage for ESG metrics
- Role-based access control
- Enhanced interactivity within the 3D map
- Implementation of automated testing and logging

---

## 12. Handover Information

This system has been documented to support handover to a future development team. The modular design allows individual components to be extended or replaced with minimal impact on the overall system.

---

**End of Document**