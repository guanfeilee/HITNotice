def should_pause(task, code):
    return code != 0 and not (task == "digest" and code == 10)
