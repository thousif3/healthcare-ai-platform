# 🏥 Healthcare AI: Predictive Appointment Management Platform

A high-performance Microservices architecture designed to mitigate revenue loss in healthcare systems by predicting patient no-show probabilities using Machine Learning.



---

## 🌟 Key Features
* **Predictive Analytics:** Real-time inference using a Scikit-Learn Random Forest model.
* **Microservices Framework:** Decoupled architecture for independent scaling of AI and Data layers.
* **Risk-Tiered UI:** Dynamic frontend that highlights "High Flight Risk" (Prob > 0.7) patients with visual alerts.
* **RBAC Ready:** Database schema supports Roles (Admin, Staff, Doctor) for secure access.

---

## 🛠️ System Architecture & Tech Stack

### **The Architecture**
The system is built on a **Three-Tier Microservice Pattern**:
1.  **Presentation Layer (Next.js 15):** A reactive dashboard that performs client-side data filtering and state management.
2.  **Logic Layer (Node.js/Express):** Acts as the central orchestrator, handling SQL queries and coordinating REST calls to the AI Engine.
3.  **Intelligence Layer (Python FastAPI):** A high-performance wrapper around a serialized ML model (`.joblib` or `.pkl`).

### **The Stack**
* **Frontend:** Next.js, Tailwind CSS, TypeScript
* **Backend:** Node.js, Express, PostgreSQL
* **AI:** Python 3.11, FastAPI, Scikit-learn, Pandas
* **DevOps:** Git, NPM, Virtualenv

---

## 🚀 Installation & Local Development

### **Prerequisites**
* PostgreSQL 16+
* Node.js 20+
* Python 3.10+

### **1. Database Setup**
```sql
CREATE DATABASE healthcare_ai;
-- Import schema
\i 'path/to/schema.sql'
