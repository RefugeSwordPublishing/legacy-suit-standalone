import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Get all completed projects
    const completedProjects = await base44.asServiceRole.entities.Project.filter({ status: 'completed' });

    // Filter to those completed for 14+ days
    const toDelete = completedProjects.filter(p => {
      const updatedDate = p.updated_date ? new Date(p.updated_date) : null;
      return updatedDate && updatedDate <= cutoffDate;
    });

    if (toDelete.length === 0) {
      return Response.json({ message: 'No projects to delete.', deleted: 0 });
    }

    let deletedProjects = 0;
    let deletedTasks = 0;
    let deletedMaterials = 0;
    let deletedFiles = 0;
    let skippedTasks = 0;

    for (const project of toDelete) {
      const pid = project.id;

      // Delete tasks, but SKIP sub-contractor tasks linked to bid requests
      const tasks = await base44.asServiceRole.entities.Task.filter({ project_id: pid });
      for (const task of tasks) {
        if (task.is_sub_contractor_task && task.bid_request_id) {
          // Verify the bid still exists before skipping
          try {
            await base44.asServiceRole.entities.BidRequest.get(task.bid_request_id);
            skippedTasks++;
            continue; // bid exists, leave this task alone
          } catch {
            // Bid was already deleted, safe to delete the task too
          }
        }
        await base44.asServiceRole.entities.Task.delete(task.id);
        deletedTasks++;
      }

      // Delete materials
      const materials = await base44.asServiceRole.entities.Material.filter({ project_id: pid });
      for (const material of materials) {
        await base44.asServiceRole.entities.Material.delete(material.id);
        deletedMaterials++;
      }

      // Delete project files
      const files = await base44.asServiceRole.entities.ProjectFile.filter({ project_id: pid });
      for (const file of files) {
        await base44.asServiceRole.entities.ProjectFile.delete(file.id);
        deletedFiles++;
      }

      // Delete the project itself
      await base44.asServiceRole.entities.Project.delete(pid);
      deletedProjects++;
    }

    return Response.json({
      message: 'Cleanup complete.',
      deleted_projects: deletedProjects,
      deleted_tasks: deletedTasks,
      skipped_sub_contractor_tasks: skippedTasks,
      deleted_materials: deletedMaterials,
      deleted_files: deletedFiles,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});