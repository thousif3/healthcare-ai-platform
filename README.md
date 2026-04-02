# 🏥 Healthcare AI: Predictive Appointment Dashboard

A full-stack Microservices platform that uses Machine Learning to predict patient "No-Show" probabilities. This project helps healthcare providers optimize scheduling by identifying high-risk appointments in real-time.

---

## 🚀 Project Overview

This platform consists of three integrated services working in harmony:
1.  **AI Engine:** A Python FastAPI service that runs a trained ML model to calculate risk scores.
2.  **Backend API:** A Node.js/Express server managing a PostgreSQL database of patients and appointments.
3.  **Frontend Dashboard:** A modern Next.js 15 interface with Tailwind CSS, featuring "High Flight Risk" visual alerts.

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons |
| **Backend** | Node.js, Express, PostgreSQL (pg-pool) |
| **AI Service** | Python 3.11, FastAPI, Scikit-learn, Uvicorn |
| **Database** | PostgreSQL 16 |

## 📐 Architecture

The system follows a microservices architecture:
* **Next.js (Port 3000)** fetches data from the Express API.
* **Express (Port 5000)** manages the relational data and coordinates with the AI service.
* **FastAPI (Port 8000)** serves the ML model predictions via REST endpoints.

---

## 🏃‍♂️ Getting Started

### 1. Database Setup
Ensure PostgreSQL is running and create the database:
```sql
CREATE DATABASE healthcare_ai;
-- Run the schema.sql file to build tables
