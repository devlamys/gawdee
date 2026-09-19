with open("backend/app/routers/admin.py", "r") as f:
    content = f.read()

old_save = """    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
    finally:"""

new_save = """    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    finally:"""
content = content.replace(old_save, new_save)

with open("backend/app/routers/admin.py", "w") as f:
    f.write(content)
