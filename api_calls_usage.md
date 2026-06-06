# Instagram API Usage Analysis (Detailed)

This document provides a precise breakdown of the API usage in VeeFore V3, distinguishing between **HTTP Requests (Network)** and **Quota Units (Rate Limit Consumption)**.

## Executive Summary

| Operation Type | HTTP Requests (Network) | Quota Units (Rate Limit) | Notes |
| :--- | :---: | :---: | :--- |
| **Full Sync (50 Posts)** | **3 Calls** | **~60 Units** | 1 Account Batch (~9) + 1 Media List (~1) + 1 Media Batch (~50) |
| **Mini Sync (20 Posts)** | **3 Calls** | **~30 Units** | Used by `DirectSync` |
| **Hourly Limit** | **N/A** | **200 Units** | Per User Token (Standard Access) |
| **Sync Capacity** | **~22 Syncs** | **~3 Complete Syncs** | Max frequency per hour is strictly limited by quota |

---

## Approved Limit (After App Review)

Once you complete **App Review** and get **Advanced Access**, the limits change dramatically.

### 1. Data Syncing (Insights)
- **New Limit**: **4,800 Requests per 24 Hours** (Rolling Window).
- **Difference**:
  - *Standard*: Capped at **200 / hour**. If you hit 201 in the 59th minute, you fail.
  - *Advanced*: You can make **1,000 calls in 1 hour** (burst), as long as you don't exceed 4,800 in the last 24 hours.
- **Benefit**: You can sync **much more frequently** during busy times (e.g., every 5 minutes during a launch) and slow down at night.

### 2. Automation (Comments & DMs) - THE GAME CHANGER
- **New Limit**: **80 Requests PER SECOND**.
- **Calculation**: 80 * 60 * 60 = **288,000 Messages per Hour**.
- **Difference**: It moves from "sharing the budget" to having its own **massive dedicated budget**.
- **Benefit**: You can effectively automate **unlimited** replies without worrying about rate limits.

---

## Automation Capacity (Summary)

| Feature | Standard Access (Now) | Advanced Access (Approved) | Recommendation |
| :--- | :--- | :--- | :--- |
| **Data Sync** | 200 / Hour | 4,800 / 24 Hours (Avg 200/hr but bursts allowed) | Sync Hourly (Standard) -> Sync 15-30 Mins (Advanced) |
| **DM/Comments** | Shares the 200/hr budget | **80 / Second** (Dedicated) | **Unlimited Automation** |

**Strategy**: Submit for App Review immediately. Until then, use **Balanced Mode** (1 sync/hour) to save quota for automation.
