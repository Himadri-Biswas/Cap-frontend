/**
 * /api/dashboard — the aggregated numbers behind the dashboard tiles.
 *
 * Every figure here is a real count from MongoDB, replacing the hard-coded
 * demo values (735 employees, 97% attendance, "Low 68% / Medium 20% / High 12%")
 * that SimpleDashboard shipped with.
 */
import { Router } from "express";
import { requireAuth, asyncHandler } from "../middleware/auth.js";
import {
  Employee,
  Job,
  Application,
  Prediction,
  LearningPath,
  User,
  AttritionEvent,
} from "../models/index.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.roles.includes("admin");

    const [
      totalEmployees,
      formerEmployees,
      openJobs,
      totalApplications,
      newApplications,
      shortlisted,
      riskRows,
      analysedCount,
      pathStats,
      departmentRows,
      recentEvents,
      userRoleRows,
    ] = await Promise.all([
      Employee.countDocuments({ employmentStatus: "active" }),
      Employee.countDocuments({ employmentStatus: "former" }),
      Job.countDocuments({ status: "open" }),
      Application.countDocuments({}),
      Application.countDocuments({ appliedAt: { $gte: new Date(Date.now() - 7 * 864e5) } }),
      Application.countDocuments({ status: "shortlisted" }),
      Prediction.aggregate([{ $group: { _id: "$risk_tier", count: { $sum: 1 } } }]),
      Prediction.countDocuments({}),
      LearningPath.aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgReadiness: { $avg: "$jobReadiness" },
            totalHours: { $sum: "$pathTotalHours" },
            totalCost: { $sum: "$pathTotalCostUsd" },
          },
        },
      ]),
      Employee.aggregate([
        { $match: { employmentStatus: "active" } },
        { $group: { _id: "$Department", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      isAdmin ? AttritionEvent.find({}).sort({ createdAt: -1 }).limit(8).lean() : Promise.resolve([]),
      isAdmin ? User.aggregate([{ $unwind: "$roles" }, { $group: { _id: "$roles", count: { $sum: 1 } } }]) : Promise.resolve([]),
    ]);

    const tiers = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    for (const row of riskRows) if (row._id in tiers) tiers[row._id] = row.count;
    const analysed = analysedCount || 1;

    const vacancyRows = await Job.aggregate([
      { $match: { status: "open" } },
      { $group: { _id: "$dept", openings: { $sum: { $ifNull: ["$openings", 1] } } } },
      { $sort: { openings: -1 } },
      { $limit: 6 },
    ]);

    res.json({
      stats: {
        totalEmployees,
        formerEmployees,
        openPositions: openJobs,
        totalApplications,
        newApplications,
        shortlisted,
        analysedEmployees: analysedCount,
        pendingAnalysis: Math.max(0, totalEmployees - analysedCount),
      },
      attrition: {
        tiers,
        percentages: {
          Low: Number(((tiers.Low / analysed) * 100).toFixed(1)),
          Medium: Number(((tiers.Medium / analysed) * 100).toFixed(1)),
          High: Number((((tiers.High + tiers.Critical) / analysed) * 100).toFixed(1)),
        },
        analysed: analysedCount,
      },
      upskilling: {
        pathCount: pathStats[0]?.count ?? 0,
        avgReadiness: Number((pathStats[0]?.avgReadiness ?? 0).toFixed(1)),
        totalHours: Number((pathStats[0]?.totalHours ?? 0).toFixed(1)),
        totalCostUsd: Number((pathStats[0]?.totalCost ?? 0).toFixed(2)),
      },
      departments: departmentRows.map((d) => ({ name: d._id || "Unassigned", members: d.count })),
      vacancies: vacancyRows.map((v) => ({ dept: v._id || "Other", openings: v.openings })),
      recentEvents,
      roleCounts: Object.fromEntries(userRoleRows.map((r) => [r._id, r.count])),
    });
  })
);

export default router;
