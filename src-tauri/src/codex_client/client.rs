use anyhow::Result;
use serde_json;
use tauri::AppHandle;
use uuid::Uuid;

use crate::protocol::{CodexConfig, InputItem, Op, Submission};

use super::{CommandBuilder, EventHandler, ProcessManager};

pub struct CodexClient {
    #[allow(dead_code)]
    app: AppHandle,
    session_id: String,
    process_manager: ProcessManager,
    #[allow(dead_code)]
    config: CodexConfig,
}

impl CodexClient {
    pub async fn new(app: &AppHandle, session_id: String, config: CodexConfig) -> Result<Self> {
        log::debug!(
            "Creating CodexClient for session and config: {} {:?}",
            session_id,
            config
        );

        // Build the command and environment variables
        let (cmd, env_vars) = CommandBuilder::build_command(&config).await?;

        // Start the process
        let mut process_manager = ProcessManager::start_process(cmd, env_vars, &config).await?;

        // Set up event handlers for stdout and stderr
        if let Some(process) = &mut process_manager.process {
            let stdout = process.stdout.take().expect("Failed to open stdout");
            let stderr = process.stderr.take().expect("Failed to open stderr");

            EventHandler::start_stdout_handler(app.clone(), stdout, session_id.clone());
            EventHandler::start_stderr_handler(stderr, session_id.clone());
        }

        let client = Self {
            app: app.clone(),
            session_id,
            process_manager,
            config: config.clone(),
        };

        Ok(client)
    }

    async fn send_submission(&self, submission: Submission) -> Result<()> {
        let json = serde_json::to_string(&submission)?;
        log::debug!("📤 Sending JSON to codex: {}", json);
        self.process_manager.send_to_stdin(json)?;
        Ok(())
    }

    pub async fn send_user_input(&self, message: String) -> Result<()> {
        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::UserInput {
                items: vec![InputItem::Text { text: message }],
            },
        };

        self.send_submission(submission).await
    }

    pub async fn send_exec_approval(&self, approval_id: String, approved: bool) -> Result<()> {
        let decision = if approved { "approved" } else { "denied" }.to_string();

        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::ExecApproval {
                id: approval_id,
                decision,
            },
        };

        self.send_submission(submission).await
    }

    #[allow(dead_code)]
    pub async fn send_patch_approval(&self, approval_id: String, approved: bool) -> Result<()> {
        let decision = if approved { "approved" } else { "denied" }.to_string();

        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::PatchApproval {
                id: approval_id,
                decision,
            },
        };

        self.send_submission(submission).await
    }

    pub async fn send_apply_patch_approval(
        &self,
        approval_id: String,
        approved: bool,
    ) -> Result<()> {
        let decision = if approved { "approved" } else { "denied" }.to_string();
        log::debug!(
            "📤 Sending apply_patch approval: id={}, decision={}",
            approval_id,
            decision
        );

        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::PatchApproval {
                id: approval_id,
                decision,
            },
        };

        self.send_submission(submission).await
    }

    pub async fn interrupt(&self) -> Result<()> {
        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::Interrupt,
        };

        self.send_submission(submission).await
    }

    pub async fn close_session(&mut self) -> Result<()> {
        log::debug!("Closing session: {}", self.session_id);

        // Send shutdown command to codex (graceful shutdown)
        let submission = Submission {
            id: Uuid::new_v4().to_string(),
            op: Op::Shutdown,
        };

        if let Err(e) = self.send_submission(submission).await {
            log::error!("Failed to send shutdown command: {}", e);
        }

        // Terminate the process
        self.process_manager.terminate().await?;

        log::debug!("Session {} closed", self.session_id);
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn shutdown(&mut self) -> Result<()> {
        self.close_session().await
    }

    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        self.process_manager.is_active()
    }

    pub fn working_directory(&self) -> &str {
        &self.config.working_directory
    }
}
