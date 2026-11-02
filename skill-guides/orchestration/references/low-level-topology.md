# Low-level topology

```text
PROMPT terminal create --workspace active --title <task_name> --command "<agent_command>" --json
PROMPT terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
PROMPT orchestration dispatch --task <task_id> --to <handle> --inject
```

To give a Task to a terminal or chat Orca did not start:

```text
PROMPT orchestration worker-start --task <task_id> --terminal <handle> --workspace <its_workspace> --json
```
