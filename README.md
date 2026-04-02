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
2. AI Service Configuration
Bash
cd ai_service
pip install -r requirements.txt
python -m uvicorn ai_service:app --port 8000 --reload
3. Backend & Seeding
Bash
npm install
node seed.js  # This will generate 600+ mock records
npm run dev
4. Frontend Dashboard
Bash
cd client
npm install
npm run dev
📊 Data Modeling
The system analyzes several features to determine risk, including:

Lead Time: Days between booking and the actual appointment.

Demographics: Age and gender factors.

History: Previous no-show record (if available in historical data).

👨‍💻 Author
Thousifuddin Shaik Graduate Student, MS in Computer Science

Indiana University Indianapolis (IUI)

Spring 2026 - Engineering Cloud Computing

📄 License
This project is licensed under the MIT License.


### **Final Pro-Tip:**
Once you have 600 patients, your dashboard might feel long. If you want to impress your professor even more, you could ask the UI agent to *"Add simple pagination to the Dashboard table so it shows 20 patients per page."*

But for now, get those 600 records in and push that README. You are officially a Full-Stack AI Engineer! 🥂

Any other final touches for tonight?
